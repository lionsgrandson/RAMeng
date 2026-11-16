// Reproducible offline workload. Replays committed Worker sources against an
// in-memory KV and synthetic Supabase; never connects to production.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import current from '../worker/src/index.js'
const require = createRequire(resolve('worker/package.json'))
const modules = new Map()
function historicalModule(ref, path) {
  const key = `${ref}:${path}`
  if (modules.has(key)) return modules.get(key)
  let source = execFileSync('git', ['show', key], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  source = source.replace(/(from\s+)['"]([^'"]+)['"]/g, (_, start, name) => {
    const url = name.startsWith('.') ? historicalModule(ref, posix.normalize(posix.join(posix.dirname(path), name))) : pathToFileURL(require.resolve(name)).href
    return `${start}${JSON.stringify(url)}`
  })
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(key, url)
  return url
}
const originalFetch = globalThis.fetch
const originalLog = console.log
const originalError = console.error
globalThis.fetch = async url => {
  assert.equal(new URL(url).origin, 'https://synthetic.supabase.co')
  if (new URL(url).pathname === '/auth/v1/user') return Response.json({ id: 'owner' })
  if (new URL(url).pathname === '/rest/v1/memberships') return Response.json([{ role: 'viewer' }])
  return Response.json([])
}
console.log = () => {}
console.error = () => {}
const results = []
try {
  for (const [name, worker, legacy] of [
    ['before-Nov15-fix', (await import(historicalModule('b445b23^', 'worker/src/index.js'))).default, true],
    ['deployed-baseline-8c8d173', (await import(historicalModule('8c8d173', 'worker/src/index.js'))).default, false],
    ['current', current, false],
  ]) {
    const counts = { read: 0, write: 0, delete: 0, list: 0 }
    const values = new Map([['rameng:admin-config:v1', { supabaseUrl: 'https://synthetic.supabase.co', supabaseAnonKey: 'synthetic' }]])
    const env = { SUPABASE_SECRET_KEY: 'synthetic', CONFIG: {
      get: async (key, format) => { counts.read++; const value = values.get(key); return value === undefined ? null : format === 'json' ? structuredClone(value) : value },
      put: async (key, value) => { counts.write++; values.set(key, value.startsWith('{') || value.startsWith('"') ? JSON.parse(value) : value) },
      delete: async key => { counts.delete++; values.delete(key) },
      list: async () => { counts.list++; return { keys: [], list_complete: true } },
    } }
    for (let minute = 0; minute < 1440; minute++) {
      const schedules = []
      if (minute % 5 === 0) schedules.push('*/5 * * * *')
      if (!legacy && [15, 45].includes(minute % 60)) schedules.push('15,45 * * * *')
      if (!legacy && minute % 120 === 0) schedules.push('0 */2 * * *')
      for (const cron of schedules) {
        let pending
        await worker.scheduled({ cron }, env, { waitUntil: promise => { pending = promise } })
        await pending
      }
    }
    results.push({ name, counts })
  }
  assert.equal(results[2].counts.write, 0)
  assert.equal(results[2].counts.delete, 0)
  assert.ok(results[2].counts.list < results[0].counts.list)
  for (const [name, worker] of [['status-baseline', (await import(historicalModule('8c8d173', 'worker/src/index.js'))).default], ['status-current', current]]) {
    const counts = { read: 0, write: 0, delete: 0, list: 0 }
    const env = { CONFIG: { get: async key => {
      counts.read++; await Promise.resolve()
      return key === 'rameng:admin-config:v1' ? { supabaseUrl: 'https://synthetic.supabase.co', supabaseAnonKey: 'synthetic', googleClientId: 'synthetic', googleClientSecret: 'synthetic' } : { access_token: 'synthetic', expires_at: Date.now() + 3600000 }
    } } }
    for (let navigation = 0; navigation < 10; navigation++) {
      const responses = await Promise.all(Array.from({ length: 25 }, () => worker.fetch(new Request('https://synthetic.test/api/integrations/status', { headers: { authorization: 'Bearer synthetic' } }), env)))
      for (const response of responses) assert.equal(response.status, 200)
    }
    results.push({ name, workload: '10 navigation bursts of 25 concurrent status requests in a warm isolate; excludes browser deduplication', counts })
  }
  assert.ok(results[4].counts.read < results[3].counts.read)
} finally {
  globalThis.fetch = originalFetch
  console.log = originalLog
  console.error = originalError
}
await mkdir('artifacts/audit', { recursive: true })
const report = { workload: '24 hours of cron invocations, empty queues, configured synthetic Supabase, no users; not an estimate of total customer usage', results }
await writeFile('artifacts/audit/kv-load.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
