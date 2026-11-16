// Read-only account-wide diagnostic. Token must have Analytics read permission.
// Budgets are operational thresholds, not an assertion about the billing plan.
import assert from 'node:assert/strict'
const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) throw Error('Set CLOUDFLARE_API_TOKEN to an authorized Analytics-read token')
const account = '45834d92b0992b24644537fc864542e4'
const date = process.env.RAMENG_KV_DATE || new Date().toISOString().slice(0, 10)
assert.match(date, /^\d{4}-\d{2}-\d{2}$/)
const budgets = JSON.parse(process.env.RAMENG_KV_BUDGETS || '{"read":100000,"write":1000,"delete":1000,"list":1000}')
const query = `{viewer {accounts(filter:{accountTag:"${account}"}) {kvOperationsAdaptiveGroups(limit:1000,filter:{date_geq:"${date}",date_leq:"${date}"}) {sum{requests} dimensions{actionType namespaceId}}}}}`
const response = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) })
const body = await response.json()
if (!response.ok || body.errors?.length) throw Error(`Cloudflare metrics unavailable: HTTP ${response.status}; codes=${body.errors?.map(error => error.extensions?.code).join(',') || 'unknown'}`)
const rows = body.data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups
if (!rows) throw Error('Cloudflare did not return account analytics')
const counts = { read: 0, write: 0, delete: 0, list: 0 }
for (const row of rows) counts[row.dimensions.actionType] = (counts[row.dimensions.actionType] || 0) + row.sum.requests
const warnings = Object.keys(counts).filter(operation => counts[operation] >= Number(budgets[operation]) * 0.8)
console.log(JSON.stringify({ account, dateUTC: date, sampledProviderAnalytics: true, counts, budgets, warnings, namespaces: [...new Set(rows.map(row => row.dimensions.namespaceId))] }, null, 2))
if (warnings.length) process.exitCode = 2
