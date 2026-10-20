// Operator-only recovery drill. Restores a local private export into a new local
// PostgreSQL instance. Never accepts a remote database URL or writes production.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as XLSX from '@e965/xlsx'

const snapshotFile = process.env.RAMENG_PRIVATE_SNAPSHOT
const runtime = process.env.RAMENG_TEST_PG_RUNTIME
if (!snapshotFile || !runtime || !isAbsolute(snapshotFile) || /^(?:https?:|\\\\|\/\/)/i.test(snapshotFile)) throw Error('Use an absolute local snapshot file and an isolated local PostgreSQL runtime')
const book = XLSX.read(await readFile(snapshotFile), { type: 'buffer', raw: true })
const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])
const records = rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }))
assert.ok(records.length > 0)
assert.ok(records.every(row => ['workspace', 'membership', 'grant', 'function'].includes(row.kind)))
const require = createRequire(join(resolve(runtime), 'package.json'))
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
const pg = new EmbeddedPostgres({ databaseDir: join(resolve(runtime), `rameng-release-restore-${Date.now()}`), user: 'postgres', password: 'disposable-restore-only', port: 55439, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
let client
try {
  await pg.initialise(); await pg.start()
  client = pg.getPgClient(); await client.connect()
  for (const file of ['tests/db-bootstrap.sql', 'supabase/setup.sql', ...(await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `supabase/migrations/${name}`)]) await client.query(await readFile(file, 'utf8'))
  await client.query("set time zone 'UTC'")
  // Authentication is a deliberately synthetic scaffold, not recovered Auth.
  const organizations = new Set(records.filter(row => row.kind !== 'function').map(row => row.payload.org_id))
  const users = new Set(records.filter(row => row.kind === 'membership').map(row => row.payload.user_id))
  for (const row of records.filter(row => row.kind !== 'function')) if (row.payload.updated_by) users.add(row.payload.updated_by)
  let index = 0
  for (const id of users) await client.query('insert into auth.users(id,email) values($1,$2)', [id, `restore-${++index}@example.test`])
  for (const id of organizations) await client.query('insert into public.organizations(id) values($1)', [id])
  const tables = { membership: 'memberships', grant: 'project_collaborators', workspace: 'workspace_state' }
  let restored = 0
  for (const kind of ['membership', 'grant', 'workspace']) for (const row of records.filter(row => row.kind === kind)) {
    const table = tables[kind]
    await client.query(`insert into public.${table} select * from jsonb_populate_record(null::public.${table},$1::jsonb)`, [JSON.stringify(row.payload)])
    const check = await client.query(`select exists(select 1 from public.${table} t where to_jsonb(t)=$1::jsonb) as equal`, [JSON.stringify(row.payload)])
    assert.equal(check.rows[0].equal, true)
    restored++
  }
  const manager = records.find(row => row.kind === 'membership' && ['admin', 'developer', 'manager'].includes(row.payload.role))?.payload
  assert.ok(manager)
  await client.query('set role authenticated')
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [manager.user_id])
  const before = await client.query('select version from public.get_workspace_state($1)', [manager.org_id])
  const saved = await client.query('select public.save_workspace_state($1,(select data from public.get_workspace_state($1)),$2) as version', [manager.org_id, before.rows[0].version])
  assert.equal(Number(saved.rows[0].version), Number(before.rows[0].version) + 1)
  await client.query('reset role')
  // Compile the exact saved production definitions to verify schema rollback
  // compatibility without applying any rollback to the live service.
  const functions = records.filter(row => row.kind === 'function')
  for (const row of functions) await client.query(row.payload.definition)
  console.log(`PASS isolated recovery: ${restored} application rows equal backup; authenticated save succeeds; ${functions.length} rollback definitions compile`)
  console.log('Excluded: real Auth credentials/sessions, original organization metadata, notifications, Storage, KV, OAuth tokens and configuration secrets')
} catch (error) { throw new Error(`Private recovery verification failed (${error.code || 'assertion'})`) } finally { if (client) await client.end(); await pg.stop() }
