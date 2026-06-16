import { app, ipcMain, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // re-check every 30 minutes

/**
 * Wires up electron-updater. Updates are downloaded in the background; the
 * renderer is notified at every step so it can show the "Update ready" popup.
 * Applying the update happens on user confirmation via `update:install`.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  // autoUpdater only works on packaged, installed builds — never in `dev`.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Tracks whether a downloaded update is staged and ready to install.
  // Guards `update:install` so we never call quitAndInstall() with nothing staged.
  let isUpdateDownloaded = false

  const send = (status: UpdateStatus): void => {
    getWindow()?.webContents.send('update:status', status)
  }

  autoUpdater.on('checking-for-update', () => {
    isUpdateDownloaded = false
    send({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    isUpdateDownloaded = false
    send({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    isUpdateDownloaded = false
    send({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    isUpdateDownloaded = true
    send({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    isUpdateDownloaded = false
    send({ state: 'error', message: err?.message ?? 'Update error' })
  })

  // Renderer-triggered actions.
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch(() => null))
  ipcMain.handle('update:install', () => {
    // Only install when an update has actually been downloaded — otherwise
    // quitAndInstall() would quit the app with nothing staged to apply.
    if (!isUpdateDownloaded) return false
    autoUpdater.quitAndInstall()
    return true
  })

  // Check once shortly after launch, then on an interval.
  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => null), 5000)
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => null), CHECK_INTERVAL_MS)
}
