import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
const runtime = process.env.RAMENG_TEST_BROWSER_RUNTIME
if (!runtime) throw Error('Set RAMENG_TEST_BROWSER_RUNTIME to the local Playwright runtime')
const require = createRequire(join(resolve(runtime), 'package.json'))
const { chromium } = require('playwright')
const server = await createServer({ configFile: 'vite.config.ts', server: { host: '127.0.0.1', port: 4177, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  let statuses = 0
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:4177') return route.abort()
    if (url.pathname === '/api/integrations/status') {
      statuses++
      // Allow concurrent callers to overlap and exercise the actual client API.
      await new Promise(resolve => setTimeout(resolve, 30))
      return route.fulfill({ json: { configured: true, google: { configured: true, connected: null, state: 'temporarily_unavailable', reason: 'quota_exceeded' }, openai: { configured: false } } })
    }
    if (url.pathname.startsWith('/api/')) throw Error(`Unexpected API request: ${url.pathname}`)
    return route.continue()
  })
  const page = await context.newPage()
  await page.clock.install()
  await page.goto('http://127.0.0.1:4177/tests/fixtures/kv-status.html')
  await page.getByRole('button', { name: 'Concurrent status' }).click()
  await page.locator('output').filter({ hasText: '25' }).waitFor()
  assert.equal(statuses, 1)
  console.log('PASS 25 concurrent status consumers send one request')
  await page.clock.runFor(1100)
  await page.getByRole('alert').waitFor()
  assert.ok(await page.getByRole('heading', { name: 'Projects remain available' }).isVisible())
  assert.equal(await page.getByText('כדי להציג משימות ב-Google Calendar, חברו את חשבון Google בהגדרות.').count(), 0)
  console.log('PASS temporary status failure leaves Projects usable and does not claim disconnection')
  // Timer advancement must not create an unbounded retry storm.
  for (let i = 0; i < 8; i++) { await page.clock.runFor(20 * 60000); await new Promise(resolve => setTimeout(resolve, 50)) }
  const bounded = statuses
  await page.clock.runFor(24 * 3600000)
  assert.equal(statuses, bounded)
  assert.ok(bounded <= 6)
  console.log('PASS automatic Calendar retries stop after five failures')
  const hidden = await context.newPage()
  await hidden.addInitScript(() => Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' }))
  await hidden.clock.install()
  await hidden.goto('http://127.0.0.1:4177/tests/fixtures/kv-status.html')
  const before = statuses
  await hidden.clock.runFor(30 * 60000)
  assert.equal(statuses, before)
  console.log('PASS second hidden tab performs no timer-driven status requests')
  await context.close()
} finally { await browser.close(); await server.close() }
