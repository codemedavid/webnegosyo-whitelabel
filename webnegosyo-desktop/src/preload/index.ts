import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  PrinterInfo,
  PrintResult,
  ReceiptPayload,
  UpdateStatus,
  PosOrderPayload,
  LocalPosOrder,
  PosCatalogCache,
  PosTenantCache,
} from '../shared/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('printers:list'),
  getPrintedOrderIds: (): Promise<string[]> => ipcRenderer.invoke('printed:list'),
  printReceipt: (payload: ReceiptPayload, opts?: { auto?: boolean }): Promise<PrintResult> =>
    ipcRenderer.invoke('receipt:print', payload, opts),
  // Auto-update bridge.
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  // Offline-first POS local persistence bridge.
  savePosOrder: (
    payload: PosOrderPayload,
    paymentStatus: 'paid' | 'pending'
  ): Promise<LocalPosOrder> => ipcRenderer.invoke('pos:saveOrder', payload, paymentStatus),
  getPendingPosOrders: (): Promise<LocalPosOrder[]> => ipcRenderer.invoke('pos:getPending'),
  getPosPendingCount: (): Promise<number> => ipcRenderer.invoke('pos:pendingCount'),
  markPosOrderSynced: (clientOrderId: string, convexOrderId: string): Promise<void> =>
    ipcRenderer.invoke('pos:markSynced', clientOrderId, convexOrderId),
  markPosOrderFailed: (clientOrderId: string, error: string): Promise<void> =>
    ipcRenderer.invoke('pos:markFailed', clientOrderId, error),
  getPosCatalog: (tenantId: string): Promise<PosCatalogCache | null> =>
    ipcRenderer.invoke('pos:getCatalog', tenantId),
  setPosCatalog: (cache: PosCatalogCache): Promise<void> =>
    ipcRenderer.invoke('pos:setCatalog', cache),
  getPosTenant: (): Promise<PosTenantCache | null> => ipcRenderer.invoke('pos:getTenant'),
  setPosTenant: (cache: PosTenantCache): Promise<void> =>
    ipcRenderer.invoke('pos:setTenant', cache),
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('api', api)
