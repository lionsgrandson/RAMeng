// Uses a separately installed embedded-postgres package; never accepts a remote URL.
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runConcurrencyChecks } from './rpc-concurrency.mjs'
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
  for (const file of ['tests/db-bootstrap.sql', 'supabase/setup.sql', ...(await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => `supabase/migrations/${name}`), 'tests/project-workflows.sql', 'tests/final-qa-workflows.sql']) {
    let sql = await readFile(file, 'utf8')
    // pg executes SQL directly; psql's success echo is not SQL.
    sql = sql.replace(/^\\echo.*$/gm, '')
    const result = await client.query(sql)
    for (const item of (Array.isArray(result) ? result : [result])) for (const row of item.rows || []) if (row.suite === 'final-qa') console.log(`PASS final QA: ${row.assertions} assertions; ${row.denials} expected denials`)
    console.log(`PASS ${file}`)
  }
  // The normal migration pass also covers databases where the optional
  // platform function is absent. Exercise its present case and DDL behavior.
  for (const file of ['tests/platform-rls-bootstrap.sql', 'supabase/migrations/20261020021737_restrict_rls_event_trigger_execution.sql', 'tests/platform-rls-assertions.sql']) {
    await client.query(await readFile(file, 'utf8'))
    console.log(`PASS ${file}`)
  }
  await runConcurrencyChecks(pg)
  console.log('PASS disposable PostgreSQL workflow integration')
} finally {
  if (client) await client.end()
  await pg.stop()
}
