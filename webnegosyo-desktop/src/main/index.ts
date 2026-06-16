import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { getSettings, setSettings, getPrintedOrderIds, hasPrinted, markPrinted } from './settings'
import {
  savePosOrder,
  getPendingPosOrders,
  getPosPendingCount,
  markPosOrderSynced,
  markPosOrderFailed,
  getPosCatalog,
  setPosCatalog,
  getPosTenant,
  setPosTenant,
} from './pos-store'
import { printReceipt } from './receipt'
import { initAutoUpdater } from './updater'
import type {
  AppSettings,
  PrinterInfo,
  PrintResult,
  ReceiptPayload,
  PosOrderPayload,
  PosCatalogCache,
  PosTenantCache,
  LocalPosOrder,
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'WebNegosyo POS',
    backgroundColor: '#f7f7f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('settings:get', (): AppSettings => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>): AppSettings => setSettings(patch))

  ipcMain.handle('printers:list', async (): Promise<PrinterInfo[]> => {
    if (!mainWindow) return []
    const printers = await mainWindow.webContents.getPrintersAsync()
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
    }))
  })

  ipcMain.handle('printed:list', (): string[] => getPrintedOrderIds())

  ipcMain.handle(
    'receipt:print',
    async (_e, payload: ReceiptPayload, opts?: { auto?: boolean }): Promise<PrintResult> => {
      if (opts?.auto && hasPrinted(payload.order._id)) {
        return { ok: true, skipped: true }
      }
      const result = await printReceipt(payload, getSettings())
      if (result.ok) markPrinted(payload.order._id)
      return result
    }
  )

  // Offline-first POS local persistence — durable ledger + catalog/tenant cache.
  ipcMain.handle(
    'pos:saveOrder',
    (_e, payload: PosOrderPayload, paymentStatus: 'paid' | 'pending'): LocalPosOrder =>
      savePosOrder(payload, paymentStatus)
  )
  ipcMain.handle('pos:getPending', (): LocalPosOrder[] => getPendingPosOrders())
  ipcMain.handle('pos:pendingCount', (): number => getPosPendingCount())
  ipcMain.handle('pos:markSynced', (_e, clientOrderId: string, convexOrderId: string): void =>
    markPosOrderSynced(clientOrderId, convexOrderId)
  )
  ipcMain.handle('pos:markFailed', (_e, clientOrderId: string, error: string): void =>
    markPosOrderFailed(clientOrderId, error)
  )
  ipcMain.handle('pos:getCatalog', (_e, tenantId: string): PosCatalogCache | null =>
    getPosCatalog(tenantId)
  )
  ipcMain.handle('pos:setCatalog', (_e, cache: PosCatalogCache): void => setPosCatalog(cache))
  ipcMain.handle('pos:getTenant', (): PosTenantCache | null => getPosTenant())
  ipcMain.handle('pos:setTenant', (_e, cache: PosTenantCache): void => setPosTenant(cache))

  createWindow()
  initAutoUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
