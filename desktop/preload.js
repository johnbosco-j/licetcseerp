// Tells the ERP it is running in the staff desktop app (it then signs students out),
// and gives the settings window its two calls. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('licetDesktop', {
  app: 'staff',
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: s => ipcRenderer.invoke('settings:save', s),
})
