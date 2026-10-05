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
const { deleteProject, deleteContact } = await server.ssrLoadModule('/src/lib/records.ts')

test('project deletion preserves dependent business records and removes their project links', () => {
  const workspace = cloneWorkspace()
  workspace.projects = [{ id: 'p' }, { id: 'keep' }]
  for (const key of ['tasks', 'events', 'files', 'quotes', 'clientNotes', 'reports']) workspace[key] = [{ id: key, projectId: 'p' }]
  const next = deleteProject(workspace, 'p')
  assert.deepEqual(next.projects, [{ id: 'keep' }])
  for (const key of ['tasks', 'events', 'files', 'quotes', 'clientNotes', 'reports']) {
    assert.equal(next[key].length, 1)
    assert.notEqual(next[key][0].projectId, 'p')
  }
  assert.equal(workspace.tasks[0].projectId, 'p')
})

test('contact deletion preserves projects and financial records without dangling client links', () => {
  const workspace = cloneWorkspace()
  workspace.contacts = [{ id: 'c' }, { id: 'keep' }]
  workspace.projects = [{ id: 'p', clientIds: ['c', 'keep'] }]
  workspace.deals = [{ id: 'd', contactId: 'c' }]
  workspace.quotes = [{ id: 'q', contactId: 'c' }]
  workspace.clientNotes = [{ id: 'n', contactId: 'c' }]
  const next = deleteContact(workspace, 'c')
  assert.deepEqual(next.projects[0].clientIds, ['keep'])
  assert.equal(next.quotes.length, 1)
  assert.equal(next.quotes[0].contactId, undefined)
  assert.equal(next.deals[0].contactId, undefined)
  assert.deepEqual(next.clientNotes, [])
})

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

test('personal Gmail links are keyed by the authenticated owner, ignoring requested owner IDs', async (t) => {
  let currentUser = 'one'
  const kv = new Map([
    ['gmail-task-links:one', { task: { threadId: 'private-one', to: 'one@example.test' } }],
    ['gmail-task-links:two', { task: { threadId: 'private-two', to: 'two@example.test' } }],
  ])
  const privateEnv = { CONFIG: { get: async (key) => key === 'rameng:admin-config:v1' ? config : kv.get(key) || null } }
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: currentUser, email: `${currentUser}@example.test` })
    if (String(url).includes('/rest/v1/memberships')) return Response.json([{ role: 'admin', permissions: null }])
    throw new Error('Unexpected Google access')
  })
  const one = await worker.fetch(request('/api/google/gmail/links?userId=two'), privateEnv)
  assert.equal(one.headers.get('cache-control'), 'no-store')
  assert.equal((await one.json()).links.task.threadId, 'private-one')
  currentUser = 'two'
  assert.equal((await (await worker.fetch(request('/api/google/gmail/links?userId=one'), privateEnv)).json()).links.task.threadId, 'private-two')
})

test('read-only users cannot write personal Gmail links', async (t) => {
  mockAuth(t)
  const req = new Request('https://qa.example.test/api/google/gmail/links', { method: 'PUT', headers: { authorization: 'Bearer qa-token', 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'task', threadId: 'thread' }) })
  assert.equal((await worker.fetch(req, env)).status, 403)
})

test('linking an existing Drive folder validates and saves an owner-scoped reference without creating a folder', async (t) => {
  const writes = []
  const calls = []
  const privateEnv = { CONFIG: {
    get: async (key) => key === 'rameng:admin-config:v1' ? config : key === 'rameng:google-tokens:v2:qa' ? { access_token: 'fixture-token', expires_at: Date.now() + 3600000 } : null,
    put: async (key, value) => writes.push([key, JSON.parse(value)]),
  } }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([String(url), init?.method || 'GET'])
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'qa', email: 'qa@example.test' })
    if (String(url).includes('/rest/v1/memberships')) return Response.json([{ role: 'admin', permissions: null }])
    if (String(url).includes('/drive/v3/files/existing-folder')) return Response.json({ id: 'existing-folder', mimeType: 'application/vnd.google-apps.folder', webViewLink: 'https://drive.google.com/drive/folders/existing-folder' })
    throw new Error('Unexpected outbound request')
  })
  const result = await worker.fetch(request('/api/google/drive/project-folder', { projectId: 'project', folderId: 'existing-folder', name: 'QA' }), privateEnv)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).id, 'existing-folder')
  assert.equal(writes[0][0], 'drive-project-folder:qa:project')
  assert.equal(calls.some(([url, method]) => url.includes('googleapis.com') && method !== 'GET'), false)
})

function googleFixture(t, handler, role = 'admin') {
  const kv = new Map([['rameng:admin-config:v1', config], ['rameng:google-tokens:v2:qa', { access_token: 'qa-google-token', expires_at: Date.now() + 3600000 }]])
  const privateEnv = { CONFIG: { get: async (key) => kv.get(key) || null, put: async (key, value) => kv.set(key, JSON.parse(value)) } }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'qa', email: 'qa@example.test' })
    if (String(url).includes('/rest/v1/memberships')) return Response.json([{ role, permissions: null }])
    assert.equal(init.headers.authorization, 'Bearer qa-google-token')
    return handler(new URL(url), init)
  })
  t.mock.method(console, 'error', () => undefined)
  return { privateEnv, kv }
}

test('Gmail sends multipart attachments with Hebrew filenames and exact binary bytes', async (t) => {
  let raw = ''
  const { privateEnv } = googleFixture(t, async (url, init) => {
    assert.equal(url.pathname, '/gmail/v1/users/me/messages/send')
    const payload = JSON.parse(init.body); raw = Buffer.from(payload.raw, 'base64url').toString('utf8')
    return Response.json({ id: 'sent', threadId: 'thread' })
  })
  const binary = Buffer.from([0, 255, 128, 10, 13])
  const response = await worker.fetch(request('/api/google/gmail/send', { to: 'client@example.test', subject: 'נושא', body: 'תוכן', attachments: [{ name: 'תכנית.pdf', type: 'application/pdf', data: binary.toString('base64') }] }), privateEnv)
  assert.equal(response.status, 200)
  assert.match(raw, /Content-Type: multipart\/mixed/)
  assert.ok(raw.includes("filename*=UTF-8''" + encodeURIComponent('תכנית.pdf')))
  assert.ok(raw.includes(binary.toString('base64')))
  assert.ok(raw.includes(Buffer.from('תוכן').toString('base64')))
})

test('Gmail rejects recipient header injection and malformed attachments before contacting Google', async (t) => {
  mockAuth(t, 'admin')
  for (const payload of [{ to: 'a@example.test\r\nBcc: other@example.test' }, { attachments: [{ name: 'x', type: 'text/plain', data: '%%%' }] }]) {
    const response = await worker.fetch(request('/api/google/gmail/send', { to: 'a@example.test', subject: 'QA', body: 'QA', ...payload }), env)
    assert.equal(response.status, 400)
  }
})

test('client Gmail sync uses exact address query, follows mailbox pagination and authenticates its owner', async (t) => {
  const { privateEnv } = googleFixture(t, async (url) => {
    if (url.pathname.endsWith('/threads')) { assert.equal(url.searchParams.get('q'), '{from:client@example.test to:client@example.test}'); assert.equal(url.searchParams.get('pageToken'), 'next'); return Response.json({ threads: [{ id: 'thread' }], nextPageToken: 'more' }) }
    return Response.json({ messages: [{ internalDate: '1791187200000', payload: { headers: [{ name: 'Subject', value: 'hello' }] }, snippet: 'private' }] })
  })
  const result = await worker.fetch(request('/api/google/gmail/contacts?emails=client%40example.test&pageToken=next&userId=other'), privateEnv)
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store')
  const body = await result.json(); assert.equal(body.nextPageToken, 'more'); assert.equal(body.threads[0].subject, 'hello')
})

test('client calendar matches attendees/organizer exactly across Google pages and excludes unrelated events', async (t) => {
  const { privateEnv } = googleFixture(t, async (url) => {
    if (url.pathname.endsWith('/calendarList')) return Response.json({ items: [{ id: 'primary', primary: true }] })
    if (!url.searchParams.get('pageToken')) return Response.json({ items: [{ id: 'unrelated', attendees: [{ email: 'notclient@example.test' }] }, { id: 'related', attendees: [{ email: 'CLIENT@example.test' }], start: { date: '2026-10-05' } }], nextPageToken: 'next' })
    return Response.json({ items: [{ id: 'organizer', organizer: { email: 'client@example.test' }, start: { dateTime: '2026-10-06T09:00:00Z' } }] })
  })
  const result = await worker.fetch(request('/api/google/calendar/contacts?emails=client%40example.test'), privateEnv)
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).items.map((item) => item.id), ['primary:organizer', 'primary:related'])
})

test('Drive upload uses personal project folder, preserves file bytes and avoids a duplicate unchanged upload', async (t) => {
  let uploads = 0
  const { privateEnv, kv } = googleFixture(t, async (url, init) => {
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files') return Response.json({ files: [] })
    if (url.pathname === '/drive/v3/files/drive-file') return Response.json({ id: 'drive-file', parents: ['private-folder'] })
    assert.equal(init.method, 'POST'); assert.equal(url.searchParams.get('supportsAllDrives'), 'true')
    const body = await init.body.text(); assert.ok(body.includes('private-folder')); assert.ok(body.includes('file-content'))
    uploads++; return Response.json({ id: 'drive-file', webViewLink: 'https://drive.google.com/file/d/drive-file/view' })
  })
  kv.set('drive-project-folder:qa:project', { id: 'private-folder' })
  kv.set('drive-project-folder:other:project', { id: 'someone-elses-folder' })
  const payload = { projectId: 'project', recordId: 'record', kind: 'file', file: { name: 'QA.txt', type: 'text/plain', data: Buffer.from('file-content').toString('base64') } }
  assert.equal((await worker.fetch(request('/api/google/drive/upload', payload), privateEnv)).status, 200)
  assert.equal((await (await worker.fetch(request('/api/google/drive/upload', payload), privateEnv)).json()).unchanged, true)
  assert.equal(uploads, 1)
})

test('Drive report update replaces an existing CRM export instead of creating duplicates; automatic settings are respected', async (t) => {
  let updates = 0
  const { privateEnv, kv } = googleFixture(t, async (url, init) => {
    if (url.pathname === '/drive/v3/files') return Response.json({ files: [{ id: 'existing-report' }] })
    assert.equal(url.pathname, '/upload/drive/v3/files/existing-report'); assert.equal(init.method, 'PATCH'); updates++
    return Response.json({ id: 'existing-report' })
  })
  kv.set('drive-project-folder:qa:project', { id: 'private-folder' })
  const payload = { projectId: 'project', recordId: 'report', kind: 'report', file: { name: 'report.html', type: 'text/html', data: Buffer.from('<h1>report</h1>').toString('base64') } }
  assert.equal((await worker.fetch(request('/api/google/drive/upload', payload), privateEnv)).status, 200)
  kv.set('drive-settings:qa', { autoFiles: true, autoReports: false })
  assert.equal((await (await worker.fetch(request('/api/google/drive/upload', payload), privateEnv)).json()).reason, 'disabled'); assert.equal(updates, 1)
})

test('read-only accounts cannot upload Drive files or obtain a Google Picker token', async (t) => {
  mockAuth(t)
  assert.equal((await worker.fetch(request('/api/google/drive/upload', { projectId: 'p' }), env)).status, 403)
  assert.equal((await worker.fetch(request('/api/google/drive/picker'), env)).status, 403)
})

test('Gmail replies validate the thread in the caller mailbox and include RFC reply headers', async (t) => {
  let sent = ''
  const { privateEnv } = googleFixture(t, async (url, init) => {
    if (url.pathname.endsWith('/threads/thread')) return Response.json({ messages: [{ payload: { headers: [{ name: 'Message-ID', value: '<original@example.test>' }, { name: 'References', value: '<older@example.test>' }] } }] })
    sent = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8')
    return Response.json({ id: 'sent', threadId: 'thread' })
  })
  const response = await worker.fetch(request('/api/google/gmail/send', { to: 'client@example.test', subject: 'QA', body: 'QA reply', threadId: 'thread' }), privateEnv)
  assert.equal(response.status, 200); assert.match(sent, /In-Reply-To: <original@example.test>/); assert.match(sent, /References: <older@example.test> <original@example.test>/)
})

test('client calendar combines visible calendars and deduplicates the same meeting across calendars', async (t) => {
  const { privateEnv } = googleFixture(t, async (url) => {
    if (url.pathname.endsWith('/calendarList')) return Response.json({ items: [{ id: 'primary', primary: true }, { id: 'team', selected: true }, { id: 'hidden', selected: false }] })
    assert.ok(!url.pathname.includes('/hidden/'))
    return Response.json({ items: [{ id: url.pathname.includes('/team/') ? 'copy' : 'meeting', iCalUID: 'meeting-uid', attendees: [{ email: 'client@example.test' }], start: { date: '2026-10-05' } }, ...(url.pathname.includes('/team/') ? [{ id: 'team-only', organizer: { email: 'client@example.test' }, start: { date: '2026-10-06' } }] : [])] })
  })
  const response = await worker.fetch(request('/api/google/calendar/contacts?emails=client%40example.test'), privateEnv)
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).items.map((event) => event.id), ['team:team-only', 'primary:meeting'])
})

test('Drive folder connection rejects a read-only folder before saving the association', async (t) => {
  const { privateEnv, kv } = googleFixture(t, async () => Response.json({ id: 'folder', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false } }))
  const response = await worker.fetch(request('/api/google/drive/project-folder', { projectId: 'project', folderId: 'folder' }), privateEnv)
  assert.equal(response.status, 403); assert.equal(kv.has('drive-project-folder:qa:project'), false)
})
