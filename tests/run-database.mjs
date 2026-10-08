// Uses a separately installed embedded-postgres package; never accepts a remote URL.
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dependencyRoot = process.env.RAMENG_TEST_PG_RUNTIME
if (!dependencyRoot) throw new Error('Set RAMENG_TEST_PG_RUNTIME to a local embedded-postgres installation')
const require = createRequire(join(resolve(dependencyRoot), 'package.json'))
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href)
const databaseDir = join(resolve(dependencyRoot), `rameng-audit-${Date.now()}`)
const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'disposable-local-test', port: 55438, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => console.error(String(message)) })
let client
try {
  await pg.initialise(); await pg.start()
  client = pg.getPgClient(); await client.connect()
  for (const file of ['tests/db-bootstrap.sql', 'supabase/setup.sql', ...(await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `supabase/migrations/${name}`), 'tests/project-workflows.sql']) {
    let sql = await readFile(file, 'utf8')
    // pg executes SQL directly; psql's success echo is not SQL.
    sql = sql.replace(/^\\echo.*$/gm, '')
    await client.query(sql)
    console.log(`PASS ${file}`)
  }
  console.log('PASS disposable PostgreSQL workflow integration')
} finally {
  if (client) await client.end()
  await pg.stop()
}
