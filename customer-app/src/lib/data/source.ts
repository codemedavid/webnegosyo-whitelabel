import type { AppCatalog, AppConfig, AppLoyalty, AppOrderDetail, AppOrderSummary } from '@/lib/contract'

/**
 * Everything the screens read. The prototype runs on `fixtureSource`; the
 * /api/app/v1 client implements the same interface, so screens never change
 * when the data becomes real.
 */
export interface AppDataSource {
  getConfig(): Promise<AppConfig>
  getCatalog(): Promise<AppCatalog>
  getLoyalty(): Promise<AppLoyalty>
  getOrders(): Promise<AppOrderSummary[]>
  getOrder(orderId: string): Promise<AppOrderDetail>
}
