import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, PrinterInfo, PrintResult, ReceiptPayload } from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('printers:list'),
  getPrintedOrderIds: (): Promise<string[]> => ipcRenderer.invoke('printed:list'),
  printReceipt: (payload: ReceiptPayload, opts?: { auto?: boolean }): Promise<PrintResult> =>
    ipcRenderer.invoke('receipt:print', payload, opts),
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('api', api)
