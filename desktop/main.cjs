const { app, BrowserWindow, Menu, ipcMain, net, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

let mainWindow = null

const configPath = () => path.join(app.getPath('userData'), 'desktop-config.json')
const setupPath = () => path.join(__dirname, 'setup.html')

function normalizeServerUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('יש להזין את כתובת מערכת ה-CRM')
  const url = new URL(raw)
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('כתובת ה-CRM חייבת להשתמש ב-HTTPS')
  }
  url.pathname = url.pathname.replace(/\/$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    return { serverUrl: parsed.serverUrl ? normalizeServerUrl(parsed.serverUrl) : '' }
  } catch {
    return { serverUrl: '' }
  }
}

function writeConfig(serverUrl) {
  const config = { serverUrl: normalizeServerUrl(serverUrl), updatedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
  return config
}

function senderIsSetup(event) {
  return String(event.senderFrame?.url || '').startsWith('file:')
}

async function testServer(serverUrl) {
  const base = normalizeServerUrl(serverUrl)
  const response = await net.fetch(`${base}/api/public-config`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`השרת החזיר שגיאה ${response.status}`)
  const body = await response.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.configured !== 'boolean') {
    throw new Error('הכתובת זמינה, אבל היא אינה מזוהה כשרת RAMeng CRM')
  }
  return { ok: true, configured: body.configured, serverUrl: base }
}

async function loadConfiguredApp() {
  if (!mainWindow) return
  const { serverUrl } = readConfig()
  if (!serverUrl) {
    await mainWindow.loadFile(setupPath())
    return
  }
  try {
    await mainWindow.loadURL(serverUrl)
  } catch {
    await mainWindow.loadFile(setupPath(), { query: { error: 'לא ניתן היה להתחבר לכתובת השמורה. אפשר לבדוק או להחליף אותה כאן.' } })
  }
}

function installNavigationGuards(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl.startsWith('file:')) return
    const configured = readConfig().serverUrl
    try {
      if (configured && new URL(targetUrl).origin === new URL(configured).origin) return
    } catch {}
    if (/^https?:\/\//i.test(targetUrl)) {
      event.preventDefault()
      void shell.openExternal(targetUrl)
    } else {
      event.preventDefault()
    }
  })
}

function createMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'מערכת',
      submenu: [
        { label: 'רענון', accelerator: 'Ctrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'שינוי כתובת מערכת', click: async () => { if (mainWindow) await mainWindow.loadFile(setupPath()) } },
        { type: 'separator' },
        { label: 'יציאה', role: 'quit' },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { role: 'zoomIn', label: 'הגדלה' },
        { role: 'zoomOut', label: 'הקטנה' },
        { role: 'resetZoom', label: 'איפוס תצוגה' },
        { role: 'togglefullscreen', label: 'מסך מלא' },
      ],
    },
  ])
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#f5f7f6',
    title: 'ראם הנדסה CRM',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  installNavigationGuards(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  void loadConfiguredApp()
}

ipcMain.handle('desktop:get-config', () => readConfig())
ipcMain.handle('desktop:test-server', async (event, serverUrl) => {
  if (!senderIsSetup(event)) throw new Error('הפעולה מותרת רק ממסך ההגדרה')
  return testServer(serverUrl)
})
ipcMain.handle('desktop:set-server-url', async (event, serverUrl) => {
  if (!senderIsSetup(event)) throw new Error('הפעולה מותרת רק ממסך ההגדרה')
  const tested = await testServer(serverUrl)
  writeConfig(tested.serverUrl)
  await loadConfiguredApp()
  return tested
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(createMenu())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
