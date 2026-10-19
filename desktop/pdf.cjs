const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

function validatePdfUrl(value, storageOrigin) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== new URL(storageOrigin).origin || !url.pathname.startsWith('/storage/v1/object/sign/crm-files/') || url.username || url.password) {
    throw new Error('ניתן לפתוח רק PDF מהאחסון המאובטח של המערכת')
  }
  return url.href
}

async function openPdfInFoxit(options) {
  const url = validatePdfUrl(options.url, options.storageOrigin)
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)
  const relative = ['Foxit Software/Foxit PDF Reader/FoxitPDFReader.exe', 'Foxit Software/Foxit Reader/FoxitReader.exe']
  const executable = roots.flatMap(root => relative.map(item => path.join(root, item))).find(item => fs.existsSync(item))
  if (!executable) throw new Error('Foxit Reader אינו מותקן במיקום הרגיל. התקינו אותו או פתחו את ה-PDF באמצעות הקישור הרגיל.')
  const response = await options.fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error('הורדת הקובץ המאובטח נכשלה')
  const limit = 100 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > limit) throw new Error('ה-PDF גדול מ-100 MB')
  const reader = response.body.getReader(); const chunks = []; let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new Error('ה-PDF גדול מ-100 MB') }
    chunks.push(Buffer.from(value))
  }
  const data = Buffer.concat(chunks)
  if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('הקובץ אינו PDF תקין')
  fs.mkdirSync(options.directory, { recursive: true })
  const filename = `${randomUUID()}.pdf`
  const target = path.join(options.directory, filename)
  fs.writeFileSync(target, data)
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [target], { shell: false, detached: true, windowsHide: false, stdio: 'ignore' })
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
  })
}

module.exports = { validatePdfUrl, openPdfInFoxit }
