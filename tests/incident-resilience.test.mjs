import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/src/index.js'
import { runDriveQueue, queueDriveUpload } from '../worker/src/driveQueue.js'
import { refreshGoogleReads } from '../worker/src/googleSync.js'
import { saveCursor, sharedRead } from '../worker/src/kvDiagnostics.js'

const config = { supabaseUrl: 'https://qa.supabase.co', supabaseAnonKey: 'public', googleClientId: 'client', googleClientSecret: 'secret' }
const tokens = { access_token: 'private-access', refresh_token: 'private-refresh', expires_at: Date.now() + 3600000, email: 'private@example.test' }
function fixture(t, token = tokens, tokenError) {
  const counts = { read: 0, write: 0, delete: 0, list: 0 }
  const values = new Map([['rameng:admin-config:v1', config], ['rameng:google-tokens:v2:owner', token]])
  const env = { CONFIG: {
    get: async key => { counts.read++; await Promise.resolve(); if (tokenError && key.includes('google-tokens')) throw tokenError; return values.get(key) || null },
    put: async (key, value) => { counts.write++; values.set(key, JSON.parse(value)) },
    delete: async key => { counts.delete++; values.delete(key) },
    list: async ({ prefix }) => { counts.list++; return { keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true } },
  } }
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'owner' })
    if (String(url).includes('/memberships')) return Response.json([{ role: 'viewer' }])
    throw Error('Unexpected provider call')
  })
  const status = () => worker.fetch(new Request('https://app.test/api/integrations/status', { headers: { authorization: 'Bearer authenticated' } }), env)
  return { counts, values, env, status }
}

for (const message of ['KV daily write quota exceeded', 'KV temporarily unavailable']) test(`status preserves unknown connection on ${message}`, async t => {
  const f = fixture(t, tokens, Error(message))
  const response = await f.status()
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('x-request-id'))
  const body = await response.json()
  assert.equal(body.google.connected, null)
  assert.equal(body.google.state, 'temporarily_unavailable')
  assert.equal(body.google.reason, message.includes('quota') ? 'quota_exceeded' : 'temporarily_unavailable')
  assert.equal(f.counts.write, 0)
  assert.doesNotMatch(JSON.stringify(body), /private-access|private-refresh/)
})

test('status distinguishes expiry, missing connection and missing configuration', async t => {
  for (const [value, state] of [[null, 'disconnected'], [{ access_token: 'expired', expires_at: 1 }, 'reconnect_required']]) {
    const f = fixture(t, value)
    assert.equal((await (await f.status()).json()).google.state, state)
  }
  const f = fixture(t)
  f.values.set('rameng:admin-config:v1', { ...config, googleClientSecret: '' })
  assert.equal((await (await f.status()).json()).google.state, 'configuration_error')
})

for (const [failure, state] of [['invalid_grant', 'reconnect_required'], ['invalid_client', 'configuration_error'], ['server_error', 'temporarily_unavailable']]) test(`OAuth ${failure} is classified and refresh storms are suppressed`, async t => {
  const f = fixture(t, { ...tokens, expires_at: 1 })
  const original = globalThis.fetch
  let refreshes = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com')) { refreshes++; assert.ok(init.signal); return Response.json({ error: failure }, { status: 400 }) }
    return original(url, init)
  })
  const responses = await Promise.all(Array.from({ length: 25 }, () => f.status()))
  for (const response of responses) assert.equal((await response.json()).google.state, state)
  assert.equal((await (await f.status()).json()).google.state, state)
  assert.equal(refreshes, 1)
  assert.equal(f.counts.write, 0)
})

test('concurrent expired-token requests refresh and persist once', async t => {
  const f = fixture(t, { ...tokens, expires_at: 1 })
  const original = globalThis.fetch
  let refreshes = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com')) { refreshes++; return Response.json({ access_token: 'new-private', expires_in: 3600 }) }
    return original(url, init)
  })
  for (const response of await Promise.all(Array.from({ length: 25 }, () => f.status()))) assert.equal((await response.json()).google.state, 'connected')
  assert.equal(refreshes, 1)
  assert.equal(f.counts.write, 1)
  assert.equal(f.values.get('rameng:google-tokens:v2:owner').refresh_token, tokens.refresh_token)
})

test('timeouts remain temporary and Supabase outages do not become invalid sessions', async t => {
  const f = fixture(t, { ...tokens, expires_at: 1 })
  const original = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com')) throw new DOMException('timeout', 'TimeoutError')
    return original(url, init)
  })
  assert.equal((await (await f.status()).json()).google.reason, 'timeout')
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }))
  assert.equal((await f.status()).status, 503)
})

test('concurrent reads coalesce within one environment and never cross tenant stores', async () => {
  let reads = 0
  const a = { CONFIG: { get: async () => { reads++; await Promise.resolve(); return 'a' } } }
  const b = { CONFIG: { get: async () => 'b' } }
  assert.deepEqual(await Promise.all(Array.from({ length: 50 }, () => sharedRead(a, 'same'))), Array(50).fill('a'))
  assert.equal(reads, 1)
  assert.equal(await sharedRead(b, 'same'), 'b')
  await sharedRead(a, 'same')
  assert.equal(reads, 2, 'settled reads must not cache stale config or permission data')
})

test('empty Google and Drive schedules never rewrite empty cursors', async t => {
  const f = fixture(t)
  for (let i = 0; i < 48; i++) await runDriveQueue(f.env, () => { throw Error('empty') })
  for (let i = 0; i < 12; i++) await refreshGoogleReads(f.env, () => { throw Error('empty') })
  assert.deepEqual(f.counts, { read: 60, write: 0, delete: 0, list: 60 })
  await saveCursor(f.env.CONFIG, 'cursor', null, '')
  await saveCursor(f.env.CONFIG, 'cursor', 'unchanged', 'unchanged')
  assert.equal(f.counts.write + f.counts.delete, 0)
})

test('Drive queue does not rewrite unchanged uploads and bounds failed background retries', async t => {
  const f = fixture(t)
  const body = { projectId: 'project', kind: 'file', recordId: 'record', file: { data: 'synthetic' } }
  await queueDriveUpload(f.env, 'owner', body, tokens.email)
  const writes = f.counts.write
  await queueDriveUpload(f.env, 'owner', body, tokens.email)
  assert.equal(f.counts.write, writes)
  const key = 'drive-pending:owner:project:file:record'
  f.values.get(key).dueAt = 1
  let attempts = 0
  const execute = async () => { attempts++; throw Error('provider unavailable') }
  for (let i = 0; i < 10; i++) { f.values.get(key).nextRetryAt = 0; await runDriveQueue(f.env, execute) }
  assert.equal(attempts, 5)
  assert.equal(f.values.get(key).attempts, 5)
  const before = f.counts.write
  await runDriveQueue(f.env, async () => { throw Error('KV quota exceeded') }, { force: true })
  assert.equal(f.counts.write, before)
  assert.ok(f.values.has(key), 'failed work survives for explicit retry')
})

test('scheduled Drive read failures back off and stop after five attempts; manual reads remain possible', async t => {
  const f = fixture(t)
  const key = 'google-feed:owner:hash'
  f.values.set(key, { userId: 'owner', url: 'https://www.googleapis.com/drive/v3/files', key: 'missing-cache' })
  let calls = 0
  const execute = async () => { calls++; return new Response('', { status: 503 }) }
  for (let i = 0; i < 10; i++) { f.values.get(key).nextRetryAt = 0; await refreshGoogleReads(f.env, execute) }
  assert.equal(calls, 5)
  assert.equal(f.values.get(key).retryAttempts, 5)
  await refreshGoogleReads(f.env, execute, { userId: 'owner', force: true })
  assert.equal(calls, 6)
})
