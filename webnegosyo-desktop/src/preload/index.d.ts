import type { AppSettings, PrinterInfo, PrintResult, ReceiptPayload } from '../shared/types'

export interface DesktopApi {
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  listPrinters: () => Promise<PrinterInfo[]>
  getPrintedOrderIds: () => Promise<string[]>
  printReceipt: (payload: ReceiptPayload, opts?: { auto?: boolean }) => Promise<PrintResult>
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
