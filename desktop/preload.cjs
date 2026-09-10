const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ramengDesktop', {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  testServer: (serverUrl) => ipcRenderer.invoke('desktop:test-server', serverUrl),
  saveServer: (serverUrl) => ipcRenderer.invoke('desktop:set-server-url', serverUrl),
})
