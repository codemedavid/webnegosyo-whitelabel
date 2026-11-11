/**
 * Which country a store delivers in — the ONE rule every pin check uses.
 *
 * `tenants.lalamove_market` only means something while Lalamove is on: 239
 * live stores carry 'HK' as a stale default with Lalamove off, and every one
 * of them trades in the Philippines. So the market is read from that column
 * only for a Lalamove store; otherwise, and when it is blank or whitespace,
 * the store delivers in the Philippines.
 */

export const PHILIPPINE_MARKET = 'PH'

export interface DeliveryMarketSource {
  lalamoveEnabled?: boolean | null
  market?: string | null
}

export function resolveDeliveryMarket({ lalamoveEnabled, market }: DeliveryMarketSource): string {
  if (lalamoveEnabled !== true) return PHILIPPINE_MARKET
  const code = (market ?? '').trim().toUpperCase()
  return code === '' ? PHILIPPINE_MARKET : code
}

export function isPhilippineDeliveryMarket(source: DeliveryMarketSource): boolean {
  return resolveDeliveryMarket(source) === PHILIPPINE_MARKET
}
