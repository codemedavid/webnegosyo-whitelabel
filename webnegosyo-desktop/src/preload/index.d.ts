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

export interface DesktopApi {
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  listPrinters: () => Promise<PrinterInfo[]>
  getPrintedOrderIds: () => Promise<string[]>
  printReceipt: (payload: ReceiptPayload, opts?: { auto?: boolean }) => Promise<PrintResult>
  checkForUpdates: () => Promise<unknown>
  installUpdate: () => Promise<boolean>
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  savePosOrder: (
    payload: PosOrderPayload,
    paymentStatus: 'paid' | 'pending'
  ) => Promise<LocalPosOrder>
  getPendingPosOrders: () => Promise<LocalPosOrder[]>
  getPosPendingCount: () => Promise<number>
  markPosOrderSynced: (clientOrderId: string, convexOrderId: string) => Promise<void>
  markPosOrderFailed: (clientOrderId: string, error: string) => Promise<void>
  getPosCatalog: (tenantId: string) => Promise<PosCatalogCache | null>
  setPosCatalog: (cache: PosCatalogCache) => Promise<void>
  getPosTenant: () => Promise<PosTenantCache | null>
  setPosTenant: (cache: PosTenantCache) => Promise<void>
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
