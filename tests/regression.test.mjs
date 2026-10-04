import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import worker from '../worker/src/index.js'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, cacheDir: 'node_modules/.vite-regression', server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { normalizePermissions, workspaceMutationError } = await server.ssrLoadModule('/src/lib/permissions.ts')
const { cloneWorkspace } = await server.ssrLoadModule('/src/seed.ts')
const backend = await server.ssrLoadModule('/src/lib/backend.ts')
const { readImportRows } = await server.ssrLoadModule('/src/lib/imports.ts')
const options = { canManageUsers: false, isDeveloper: false }

test('UTF-8 Hebrew CSV without a BOM imports and normalizes Israeli dates', async () => {
  const buffer = new TextEncoder().encode('משימה,תאריך התחלה,תאריך סיום,מועד מעקב\nבדיקה,04/10/2026,2026-10-10,08.10.2026').buffer
  const [row] = await readImportRows(buffer, true)
  assert.equal(row['משימה'], 'בדיקה')
  assert.equal(row['תאריך התחלה'], '2026-10-04')
  assert.equal(row['תאריך סיום'], '2026-10-10')
  assert.equal(row['מועד מעקב'], '2026-10-08')
})

test('Excel date cells normalize to valid date inputs', async () => {
  const XLSX = await import('@e965/xlsx')
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ משימה: 'בדיקה', 'תאריך סיום': new Date(2026, 9, 10) }]), 'QA')
  const [row] = await readImportRows(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), false)
  assert.equal(row['תאריך סיום'], '2026-10-10')
})

test('invalid imported dates are rejected before workspace mutation', async () => {
  await assert.rejects(readImportRows(new TextEncoder().encode('משימה,תאריך סיום\nבדיקה,31/02/2026').buffer, true), /תאריך לא תקין/)
})

test('viewer cannot create or edit; hidden areas cannot retain write actions', () => {
  const permissions = normalizePermissions('viewer', { projects: { view: false, create: true, edit: true } })
  assert.equal(permissions.projects.create, false)
  const before = cloneWorkspace()
  const after = { ...before, contacts: [{ id: 'new', name: 'QA' }] }
  assert.match(workspaceMutationError(before, after, permissions, options), /הוספה/)
})

test('status-only permissions allow task and nested report statuses, reject text edits', () => {
  const permissions = normalizePermissions('viewer', { tasks: { status: true }, reports: { status: true } })
  const before = cloneWorkspace()
  before.tasks = [{ id: 'task', status: 'בטיפול', title: 'QA' }]
  before.reports = [{ id: 'report', sections: [{ id: 'section', items: [{ id: 'item', status: 'פתוח', description: 'QA' }] }] }]
  const after = structuredClone(before)
  after.tasks[0].status = 'בוצע'
  after.reports[0].sections[0].items[0].status = 'תקין'
  assert.equal(workspaceMutationError(before, after, permissions, options), null)
  after.tasks[0].title = 'Changed'
  assert.match(workspaceMutationError(before, after, permissions, options), /עריכה/)
})

test('edit permission does not permit deleting nested report entities', () => {
  const before = cloneWorkspace()
  before.reports = [{ id: 'report', sections: [{ id: 'section', items: [{ id: 'item', status: 'פתוח' }] }] }]
  const after = structuredClone(before)
  after.reports[0].sections[0].items = []
  const permissions = normalizePermissions('viewer', { reports: { edit: true } })
  assert.match(workspaceMutationError(before, after, permissions, options), /מחיקה/)
})

test('unavailable browser cache does not prevent a save', async () => {
  const previous = globalThis.localStorage
  globalThis.localStorage = { getItem() { return null }, setItem() { throw new Error('QuotaExceeded') } }
  try {
    backend.configureBackend({ configured: false, apiBase: '', supabaseUrl: '', supabaseAnonKey: '' })
    const result = await backend.saveOrganizationWorkspace('local', 'qa', cloneWorkspace(), 4)
    assert.equal(result.version, 5)
  } finally { if (previous) globalThis.localStorage = previous; else delete globalThis.localStorage }
})

test('plain-object authentication errors are translated into Hebrew', async (t) => {
  backend.configureBackend({ configured: true, apiBase: '', supabaseUrl: 'https://qa.supabase.co', supabaseAnonKey: 'qa-key' })
  t.mock.method(globalThis, 'fetch', async () => Response.json({ msg: 'Invalid login credentials', code: 'invalid_credentials' }, { status: 400 }))
  await assert.rejects(backend.signIn('qa@example.test', 'fake-password'), /המייל או הסיסמה שגויים/)
})

test('returned sign-out errors are surfaced instead of silently ignored', async (t) => {
  t.mock.method(backend.getBackend().auth, 'signOut', async () => ({ error: { message: 'Request failed' } }))
  await assert.rejects(backend.signOut(), /היציאה נכשלה/)
})

const config = { supabaseUrl: 'https://qa.supabase.co', supabaseAnonKey: 'qa-public-key', googleClientSecret: 'must-not-be-public', developerEmails: [] }
const env = { CONFIG: { get: async () => config } }
const request = (path, body, token = true) => new Request(`https://qa.example.test${path}`, {
  method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: 'Bearer qa-token' } : {}), 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
})
const mockAuth = (t, role = 'viewer', permissions = null) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'qa', email: 'qa@example.test', user_metadata: { role: 'developer' } })
    if (String(url).includes('/rest/v1/memberships')) return Response.json([{ role, permissions }])
    throw new Error('Unexpected outbound call')
  })
  t.mock.method(console, 'error', () => undefined)
  return calls
}

test('public config contains no secret credentials or developer email list', async () => {
  const result = await worker.fetch(request('/api/public-config', null, false), env)
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.equal(body.googleClientSecret, undefined)
  assert.equal(body.developerEmails, undefined)
  assert.equal(body.supabaseAnonKey, 'qa-public-key')
})

test('private endpoints require authentication', async (t) => {
  mockAuth(t)
  for (const path of ['/api/admin/config', '/api/google/config', '/api/integrations/status', '/api/google/gmail/thread', '/api/google/drive/files']) {
    assert.equal((await worker.fetch(request(path, null, false), env)).status, 401, path)
  }
})

test('user-editable metadata cannot grant developer access', async (t) => {
  mockAuth(t)
  assert.equal((await worker.fetch(request('/api/admin/config'), env)).status, 403)
})

test('viewer cannot send email or create Google events', async (t) => {
  mockAuth(t)
  assert.equal((await worker.fetch(request('/api/google/gmail/send', { to: 'qa@example.test' }), env)).status, 403)
  assert.equal((await worker.fetch(request('/api/google/calendar/events', { summary: 'QA', start: '2026-10-04T09:00:00Z' }), env)).status, 403)
})

test('hidden calendar remains forbidden even with a stale custom create grant', async (t) => {
  mockAuth(t, 'admin', { calendar: { view: false, create: true } })
  assert.equal((await worker.fetch(request('/api/google/calendar/events', { summary: 'QA', start: '2026-10-04T09:00:00Z' }), env)).status, 403)
})

test('calendar API rejects malformed, equal and reversed end times before Google access', async (t) => {
  const calls = mockAuth(t, 'admin')
  for (const end of ['bad-date', '2026-10-04T09:00:00Z', '2026-10-04T08:00:00Z']) {
    const result = await worker.fetch(request('/api/google/calendar/events', { summary: 'QA', start: '2026-10-04T09:00:00Z', end }), env)
    assert.equal(result.status, 400)
    assert.match((await result.json()).error, /מועד הסיום/)
  }
  assert.equal(calls.some((url) => url.includes('googleapis.com')), false)
})
