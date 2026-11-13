// Non-mutating release verification. Never reads a session or sends credentials.
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const base = process.env.RAMENG_SMOKE_BASE || 'https://rameng-crm.rameng-crm-worker.workers.dev'
const buildDir = process.env.RAMENG_SMOKE_BUILD || 'dist'
const evidenceName = process.env.RAMENG_SMOKE_NAME || 'production-smoke'
const results = []
const hash = value => createHash('sha256').update(value).digest('hex')
async function check(name, action) {
  await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`)
}
await check('live HTML matches the verified production build and excludes QA fixtures', async () => {
  const response = await fetch(base, { cache: 'no-store' })
  assert.equal(response.status, 200)
  const content = await response.text()
  assert.equal(hash(content), hash(await readFile(join(buildDir, 'index.html'))))
  assert.doesNotMatch(content, /qa-user|qa-incoming|VITE_QA_FIXTURES|tests\/fixtures/)
})
for (const file of await readdir(buildDir, { recursive: true, withFileTypes: true })) {
  if (!file.isFile() || file.name === 'index.html') continue
  const parent = file.parentPath || file.path
  const path = join(parent, file.name)
  const relative = path.slice(buildDir.length + 1).replaceAll('\\', '/')
  await check(`live static asset matches: ${relative}`, async () => {
    const response = await fetch(`${base}/${relative.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' })
    assert.equal(response.status, 200)
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await readFile(path)))
  })
}
await check('runtime configuration targets RAMENG without privileged credential fields', async () => {
  const response = await fetch(`${base}/api/public-config`)
  assert.equal(response.status, 200)
  const config = await response.json()
  assert.equal(config.configured, true)
  assert.equal(new URL(config.supabaseUrl).hostname, 'qvunspguudkhwgbjvvuf.supabase.co')
  const verify = value => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /secret|service.?role|password|refresh.?token|access.?token/i)
      verify(child)
    }
  }
  verify(config)
})
for (const [path, method, body] of [
  ['/api/google/gmail/thread?threadId=rameng-smoke-missing', 'GET'],
  ['/api/google/gmail/attachment?messageId=rameng-smoke-missing&partId=1', 'GET'],
  ['/api/application-errors', 'POST', {orgId:'rameng-smoke-missing',operation:'unused',message:'unused'}],
  ['/api/google/calendar/tasks/sync', 'POST', { orgId: '40000000-0000-0000-0000-000000000001' }],
  ['/api/google/gmail/read', 'POST', { threadId: 'rameng-smoke-missing' }],
  ['/api/google/gmail/unread', 'POST', { threadId: 'rameng-smoke-missing' }],
  ['/api/google/drive/folder', 'POST', { projectId: 'rameng-smoke-missing', parentId: 'rameng-smoke-missing', name: 'unused' }],
  ['/api/google/drive/folder', 'PATCH', { projectId: 'rameng-smoke-missing', parentId: 'rameng-smoke-missing', fileId: 'rameng-smoke-missing' }],
  ['/api/task-comments?orgId=rameng-smoke-missing&taskId=rameng-smoke-missing', 'GET'],
]) await check(`anonymous access denied: ${method} ${path.split('?')[0]}`, async () => {
  const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal(response.status, 401)
})
await check('preflight supports folder moves and rename', async () => {
  const response = await fetch(`${base}/api/google/drive/folder`, { method: 'OPTIONS', headers: { origin: base, 'access-control-request-method': 'PATCH' } })
  assert.equal(response.status, 204)
  assert.match(response.headers.get('access-control-allow-methods'), /PATCH/)
})
await mkdir('artifacts/audit', { recursive: true })
await writeFile(`artifacts/audit/${evidenceName}-20261113.json`, JSON.stringify({ base, sourceCommit: process.env.RAMENG_RELEASE_SHA || '', checkedAt: new Date().toISOString(), results }, null, 2))
console.log(`${results.length}/${results.length} production smoke checks passed`)
