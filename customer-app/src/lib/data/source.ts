import type { VoucherTerms } from '@/lib/checkout/voucher'
import type { AppCatalog, AppConfig, AppLoyalty, AppOrderDetail, AppOrderDraft, AppOrderSummary } from '@/lib/contract'

/** A delivery fee for one address (pesos, like the wire). */
export interface DeliveryQuote {
  fee: number
  etaMinutes: number
}

/**
 * Everything the screens read. The prototype runs on `fixtureSource`; the
 * /api/app/v1 client implements the same interface, so screens never change
 * when the data becomes real.
 */
export interface AppDataSource {
  getConfig(): Promise<AppConfig>
  /** The menu as one branch sells it; null = store-wide (single-location stores). */
  getCatalog(outletId?: string | null): Promise<AppCatalog>
  getLoyalty(): Promise<AppLoyalty>
  getOrders(): Promise<AppOrderSummary[]>
  getOrder(orderId: string): Promise<AppOrderDetail>
  /** The server reprices every line; what comes back is the order as the store sees it. */
  placeOrder(draft: AppOrderDraft): Promise<AppOrderDetail>
  /** null = no such voucher (or not for this store). */
  previewVoucher(code: string): Promise<VoucherTerms | null>
  quoteDelivery(outletId: string | null, address: string): Promise<DeliveryQuote>
}
