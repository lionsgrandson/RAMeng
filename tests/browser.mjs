// Real browser interactions against disposable fixtures. Never uses a remote backend.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'

const runtime = process.env.RAMENG_TEST_BROWSER_RUNTIME
if (!runtime) throw new Error('Set RAMENG_TEST_BROWSER_RUNTIME to a local playwright installation')
const require = createRequire(join(resolve(runtime), 'package.json'))
const { chromium } = require('playwright')
const base = process.env.RAMENG_QA_BASE_URL || 'http://127.0.0.1:4176'
if (!['http://127.0.0.1:4176', 'https://rameng-crm-audit-preview.rameng-crm-worker.workers.dev'].includes(base)) throw new Error('Browser mutations are allowed only against isolated QA fixtures')
const server = process.env.RAMENG_QA_BASE_URL ? null : await createServer({ configFile: 'tests/qa.config.mjs', server: { port: 4176 } })
await server?.listen()
const browser = await chromium.launch({ headless: true, ...(process.env.RAMENG_TEST_HTTP1 === 'true' ? { args: ['--disable-http2'] } : {}), ...(process.env.RAMENG_TEST_CHROMIUM ? { executablePath: process.env.RAMENG_TEST_CHROMIUM } : {}) })
await mkdir('artifacts/audit', { recursive: true })
const results = []
async function scenario(name, action, query = '', route = 'tasks') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Fixtures must not make any requests to production or Google services.
  await page.route('**/*', request => new URL(request.request().url()).origin === base ? request.continue() : request.abort())
  try {
    await page.goto(`${base}/${query}#app?page=${route}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.topbar, .external-task-page').waitFor({ state: 'visible' })
    await action(page)
    assert.deepEqual(errors, [])
    results.push({ name, passed: true }); console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, passed: false, error: String(error) }); console.error(`FAIL ${name}: ${error}`)
    await page.screenshot({ path: `artifacts/audit/failure-${results.length}.png`, fullPage: true }).catch(() => undefined)
  } finally { await context.close() }
}
try {
  for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) await scenario(`task interactions and overflow at ${width}px`, async page => {
    await page.setViewportSize({ width, height: 950 })
    await page.getByRole('button', { name: 'משימה חדשה', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await dialog.locator('[name="title"]').fill(`משימה ${width}`)
    await dialog.locator('[name="description"]').fill('תיאור בעברית / English')
    await dialog.getByRole('button', { name: 'יצירת משימה', exact: true }).click()
    await page.getByRole('textbox', { name: 'חיפוש משימות', exact: true }).fill(`משימה ${width}`)
    await page.locator('[data-task-id]').first().waitFor()
    assert.equal(await page.locator('[data-task-id]').count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `artifacts/audit/tasks-${width}.png`, fullPage: true })
  })
  await scenario('500 task search and archive interactions', async page => {
    assert.equal(await page.locator('[data-task-id]').count(), 400)
    await page.getByRole('textbox', { name: 'חיפוש משימות', exact: true }).fill('בדיקה 499')
    assert.equal(await page.locator('[data-task-id]').count(), 1)
    await page.getByRole('textbox', { name: 'חיפוש משימות', exact: true }).fill('')
    await page.getByRole('tab', { name: /משימות שהושלמו/ }).click()
    assert.equal(await page.locator('[data-task-id]').count(), 100)
  }, '?qaTasks=500')
  await scenario('task import previews, commits English fields and rejects duplicate reimport', async page => {
    const payload = { name: 'tasks.csv', mimeType: 'text/csv', buffer: Buffer.from('Task,Project,Status,Due Date,Description\nמשימה מיובאת,פרויקט בדיקה,בטיפול,23/10/2026,פרטים\nTask,Project,Status,Due Date,Description') }
    await page.getByLabel('ייבוא קובץ משימות').setInputFiles(payload)
    const dialog = page.getByRole('dialog')
    await dialog.getByText('משימה מיובאת', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'ייבוא 1 משימות' }).click()
    await page.getByText('יובאו 1 משימות; דולגו 0 כפילויות', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'שמירה', exact: true }).first().click()
    await page.getByLabel('ייבוא קובץ משימות').setInputFiles(payload)
    await dialog.getByText('0 משימות חדשות · 1 כפילויות ידולגו', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'ייבוא 0 משימות' }).isDisabled(), true)
  }, '', 'imports')
  await scenario('contacts import preserves phone zeros and previews duplicates', async page => {
    const payload = { name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Company,Phone,Email\nבדיקת קשר,חברה,0521234567,synthetic@example.test') }
    await page.getByLabel('ייבוא קובץ לקוחות').setInputFiles(payload)
    const dialog = page.getByRole('dialog')
    await dialog.getByText('0521234567', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'ייבוא 1 לקוחות' }).click()
    await page.getByText('יובאו 1 לקוחות; דולגו 0 כפילויות', { exact: true }).waitFor()
    await page.getByLabel('ייבוא קובץ לקוחות').setInputFiles(payload)
    await dialog.getByText('0 אנשי קשר חדשים · 1 כפילויות ידולגו', { exact: true }).waitFor()
  }, '', 'imports')
  await scenario('selected task report opens, edits and exports safe CSV with source identity', async page => {
    await page.getByLabel('בחירת כל המשימות המסוננות לסיכום').check()
    await page.getByRole('button', { name: 'יצירת טיוטת דוח פיקוח מהמשימות שנבחרו' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('כותרת דוח').fill('דוח שבועי בדיקה')
    await dialog.getByLabel('תחילת תקופת הדיווח').fill('2026-10-18')
    await dialog.getByLabel('סיום תקופת הדיווח').fill('2026-10-24')
    await dialog.getByRole('button', { name: 'יצירת טיוטה ופתיחת הדוח' }).click()
    await page.getByLabel('כותרת', { exact: true }).waitFor()
    await page.locator('.inspection-item .issue-main > label textarea').first().fill('=HYPERLINK("https://example.test")\nתיאור ארוך')
    await page.getByLabel('אחראי', { exact: true }).fill('אחראי בדיקה')
    await page.getByLabel('סיכום והערות').fill('סיכום בדיקה בלבד')
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSV', exact: true }).click()
    const download = await downloadEvent
    const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk)
    const csv = Buffer.concat(chunks).toString('utf8')
    assert.ok(csv.includes("'=")); assert.ok(csv.includes('qa-task')); assert.ok(csv.includes('אחראי בדיקה'))
    await page.emulateMedia({ media: 'print' })
    await page.evaluate(() => { document.body.dataset.printReport = document.querySelector('[data-report-id]').dataset.reportId })
    assert.equal(await page.locator('.project-header').isVisible(), false)
    assert.equal(await page.locator('.print-report').isVisible(), true)
    await page.screenshot({ path: 'artifacts/audit/report-print.png', fullPage: true })
  }, '', 'projects&project=qa-project&tab=tasks')
  await scenario('status settings add, rename and safely reassign custom status', async page => {
    await page.getByRole('tab', { name: 'תצוגה', exact: true }).click()
    await page.getByLabel('סטטוס חדש', { exact: true }).fill('לבדיקה')
    await page.getByRole('button', { name: 'הוספת סטטוס' }).click()
    await page.getByRole('button', { name: 'שינוי שם סטטוס לבדיקה', exact: true }).click()
    await page.getByLabel('שם חדש לסטטוס').fill('לאישור')
    await page.getByRole('button', { name: 'אישור ועדכון המשימות' }).click()
    await page.getByRole('button', { name: 'החלפת סטטוס לאישור', exact: true }).click()
    await page.getByLabel('סטטוס חלופי', { exact: true }).selectOption('בטיפול')
    await page.getByRole('button', { name: 'אישור ועדכון המשימות' }).click()
    assert.equal(await page.getByRole('button', { name: 'שינוי שם סטטוס לאישור', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'שינוי שם סטטוס בוצע', exact: true }).count(), 0)
  }, '', 'settings')
  await scenario('view-only role cannot create tasks or edit their names', async page => {
    await page.locator('[data-task-id]').waitFor()
    assert.equal(await page.getByRole('button', { name: 'משימה חדשה', exact: true }).count(), 0)
    assert.equal(await page.getByRole('textbox', { name: 'שם משימה', exact: true }).isDisabled(), true)
  }, '?qaRole=viewer')
  await scenario('status-only role can complete but cannot change task descriptions', async page => {
    const row = page.locator('[data-task-id]').first(); await row.waitFor()
    assert.equal(await row.getByRole('textbox', { name: 'שם משימה', exact: true }).isDisabled(), true)
    await row.locator('[data-column-key="status"] select').selectOption('בוצע')
    await page.getByRole('tab', { name: /משימות שהושלמו/ }).click()
    assert.equal(await page.locator('[data-task-id]').count(), 1)
  }, '?qaRole=status')
  await scenario('project creation opens its central workspace and survives reload', async page => {
    await page.getByRole('button', { name: 'פרויקט חדש', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('[name="name"]').fill('פרויקט סינתטי בלבד')
    await dialog.locator('[name="address"]').fill('רחוב בדיקות 123, ירושלים')
    await dialog.getByRole('button', { name: 'יצירת פרויקט', exact: true }).click()
    await page.getByRole('heading', { name: 'פרויקט סינתטי בלבד', exact: true }).waitFor()
    await page.locator('.save-indicator.saved').waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'פרויקט סינתטי בלבד', exact: true }).waitFor()
  }, '', 'projects')
  await scenario('contacts paging, global search and opening a card', async page => {
    assert.equal(await page.locator('.project-contacts-table tbody tr').count(), 25)
    await page.getByRole('button', { name: 'הבא', exact: true }).first().click()
    await page.getByText('26–50 מתוך 62 אנשי קשר', { exact: true }).first().waitFor()
    await page.getByRole('textbox', { name: 'חיפוש לקוחות', exact: true }).fill('איש קשר 62')
    assert.equal(await page.locator('.project-contacts-table tbody tr').count(), 1)
    await page.getByRole('button', { name: /פתיחת כרטיס איש קשר 62/ }).click()
    await page.getByRole('heading', { name: /איש קשר 62/ }).waitFor()
  }, '?qaContacts=62', 'clients')
  await scenario('external assignee changes status and posts a scoped comment', async page => {
    await page.getByLabel('סטטוס המשימה שלי').selectOption('בוצע')
    await page.getByRole('textbox', { name: /תגובה/ }).fill('הושלם בבדיקת QA בלבד')
    await page.getByRole('button', { name: /הוספת תגובה/ }).click()
    await page.getByText('הושלם בבדיקת QA בלבד', { exact: true }).waitFor()
    assert.equal(await page.locator('.sidebar').count(), 0)
    await page.locator('.workspace-save-button').getByText(/שמירה|נשמר/).waitFor()
  }, '?qaRole=external', 'tasks&task=qa-assigned')
  await scenario('external unrelated task is unavailable', async page => {
    await page.getByRole('heading', { name: 'המשימה אינה זמינה' }).waitFor()
    assert.equal(await page.getByLabel('סטטוס המשימה שלי').count(), 0)
  }, '?qaRole=external', 'tasks&task=unrelated')
  await scenario('workspace save conflicts preserve unsaved edits and offer recovery', async page => {
    await page.getByRole('textbox', { name: 'שם משימה', exact: true }).fill('עריכה מקומית בלבד')
    await page.getByRole('alert').filter({ hasText: 'משתמש אחר עדכן את הנתונים' }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'שם משימה', exact: true }).inputValue(), 'עריכה מקומית בלבד')
    await page.getByRole('button', { name: 'טעינת הגרסה העדכנית' }).waitFor()
  }, '?qaSave=conflict')
  await scenario('task modal keyboard focus remains in dialog and returns to opener', async page => {
    const opener = page.getByRole('button', { name: 'משימה חדשה', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog'); await dialog.waitFor()
    await dialog.getByRole('button', { name: 'סגירה', exact: true }).focus()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
    assert.equal(await opener.evaluate(element => document.activeElement === element), true)
  })

} finally {
  await writeFile('artifacts/audit/browser-results.json', JSON.stringify(results, null, 2))
  await browser.close(); await server?.close()
}
const failures = results.filter(result => !result.passed).length
console.log(`${results.length - failures}/${results.length} browser scenarios passed`)
if (failures) process.exitCode = 1
