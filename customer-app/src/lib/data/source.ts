import type {
  AppCatalog,
  AppConfig,
  AppDeliveryQuote,
  AppDeliveryQuoteRequest,
  AppLoyalty,
  AppOrderDetail,
  AppOrderDraft,
  AppOrderPage,
  AppPlace,
  AppPlacesQuery,
  AppVoucherPreview,
  AppVoucherPreviewRequest,
} from '@/lib/contract'

/**
 * Everything the screens read. The demo runs on `fixtureSource`; the
 * /api/app/v1 client implements the same interface, so screens never change
 * when the data becomes real. Failures are `AppApiError`s with the wire's codes.
 */
export interface AppDataSource {
  getConfig(): Promise<AppConfig>
  /** The menu as one branch sells it; null = store-wide (single-location stores). */
  getCatalog(outletId?: string | null): Promise<AppCatalog>
  getLoyalty(): Promise<AppLoyalty>
  /** The customer's app orders, newest first; null cursor = the first page. */
  getOrders(cursor: string | null): Promise<AppOrderPage>
  getOrder(orderId: string): Promise<AppOrderDetail>
  /**
   * The server reprices every line; what comes back is the order as the store
   * sees it. The same key on a retry returns the same order, never a second one.
   */
  placeOrder(draft: AppOrderDraft, idempotencyKey: string): Promise<AppOrderDetail>
  /** The store's answer for THIS bag; null = no such voucher (or not for this store). */
  previewVoucher(request: AppVoucherPreviewRequest): Promise<AppVoucherPreview | null>
  /** Out of area comes back as a `refused` error carrying the store's words. */
  quoteDelivery(request: AppDeliveryQuoteRequest): Promise<AppDeliveryQuote>
  searchPlaces(query: AppPlacesQuery): Promise<AppPlace[]>
}
