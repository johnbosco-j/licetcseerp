// LICET Things Staff — desktop app for staff (Windows .exe / macOS .dmg).
// The department ERP in its own window, plus the Attendance Station for QR self check-in,
// started from the menu (no separate install). Students are signed out: the app is for staff.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')

const defaults = require('./config.json')
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')
function settings() {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } } catch { return { ...defaults } }
}
const cfg = settings()
const origin = () => new URL(cfg.erpUrl).origin
const sameOrigin = url => { try { return new URL(url).origin === origin() } catch { return false } }

let main = null, stationWin = null, stationRunning = false

function createMain() {
  main = new BrowserWindow({
    width: 1360, height: 880, minWidth: 900, minHeight: 600, title: 'LICET Things Staff',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  main.loadURL(cfg.erpUrl + '/login')
  // stay on the ERP; everything else opens in the normal browser
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) return { action: 'allow' }
    shell.openExternal(url); return { action: 'deny' }
  })
  main.webContents.on('will-navigate', (e, url) => { if (!sameOrigin(url)) { e.preventDefault(); shell.openExternal(url) } })
  main.on('closed', () => { main = null })
}

async function openStation() {
  if (!stationRunning) {
    // The station runs inside this app: phones on the classroom Wi-Fi reach it on this computer.
    process.env.SUPABASE_URL = cfg.supabaseUrl
    process.env.SUPABASE_ANON_KEY = cfg.supabaseAnonKey
    process.env.STATION_PORT = String(cfg.stationPort || 7070)
    try {
      await import(pathToFileURL(path.join(__dirname, 'station', 'server.mjs')).href)
      stationRunning = true
    } catch (e) {
      dialog.showErrorBox('Attendance Station', `Could not start: ${e.message}\nIs another copy already running on port ${process.env.STATION_PORT}?`)
      return
    }
  }
  if (stationWin && !stationWin.isDestroyed()) { stationWin.focus(); return }
  stationWin = new BrowserWindow({
    width: 1240, height: 860, title: 'Attendance Station', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  setTimeout(() => stationWin?.loadURL(`http://localhost:${cfg.stationPort || 7070}`), stationRunning ? 300 : 1200)
  stationWin.on('closed', () => { stationWin = null })
}

function startClassroomWifi() {
  if (process.platform === 'win32') {
    const dir = path.join(__dirname, 'station', 'windows').replace('app.asar', 'app.asar.unpacked')
    spawn('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'start-hotspot.ps1')], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    dialog.showMessageBox({
      type: 'info', title: 'Classroom Wi-Fi on a Mac',
      message: 'Turn on Internet Sharing to Wi-Fi',
      detail: 'macOS does not let apps create a hotspot. In System Settings → General → Sharing, turn on Internet Sharing (share from Ethernet or USB to Wi-Fi). Or join this Mac and the students to your phone\'s hotspot. Then open the Attendance Station.',
      buttons: ['Open Sharing settings', 'Close'],
    }).then(r => { if (r.response === 0) shell.openExternal('x-apple.systempreferences:com.apple.Sharing-Settings.extension') })
  }
}

function openSettings() {
  const w = new BrowserWindow({ width: 560, height: 360, title: 'ERP address', parent: main ?? undefined, modal: !!main,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } })
  w.setMenu(null)
  w.loadFile(path.join(__dirname, 'settings.html'))
}
ipcMain.handle('settings:get', () => ({ erpUrl: cfg.erpUrl, supabaseUrl: cfg.supabaseUrl }))
ipcMain.handle('settings:save', (_e, next) => {
  const erpUrl = String(next?.erpUrl ?? '').trim().replace(/\/+$/, '')
  const supabaseUrl = String(next?.supabaseUrl ?? '').trim().replace(/\/+$/, '')
  const anon = String(next?.supabaseAnonKey ?? '').trim()
  for (const u of [erpUrl, supabaseUrl]) if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) return { error: `Not a valid https address: ${u}` }
  const saved = { erpUrl, supabaseUrl, ...(anon ? { supabaseAnonKey: anon } : {}) }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(saved, null, 2))
  app.relaunch(); app.exit(0)
  return { ok: true }
})

function buildMenu() {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'ERP home', accelerator: 'CmdOrCtrl+Shift+H', click: () => main?.loadURL(cfg.erpUrl + '/dashboard') },
      { label: 'Change ERP address…', click: openSettings },
      { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: 'Attendance', submenu: [
      { label: 'Open Attendance Station', accelerator: 'CmdOrCtrl+Shift+A', click: openStation },
      { label: process.platform === 'win32' ? 'Start classroom Wi-Fi' : 'Classroom Wi-Fi help', click: startClassroomWifi },
      { label: 'Take attendance in the ERP', click: () => main?.loadURL(cfg.erpUrl + '/dashboard/attendance') },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [
      { label: 'Station guide', click: () => shell.openExternal('https://github.com/johnbosco-j/licetcseerp/blob/main/station/README.md') },
      { label: `Version ${app.getVersion()}`, enabled: false },
    ] },
  ]))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus() } })
  app.whenReady().then(() => { buildMenu(); createMain(); if (process.env.LICET_OPEN_STATION === '1') openStation() })
  app.on('activate', () => { if (!main) createMain() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
