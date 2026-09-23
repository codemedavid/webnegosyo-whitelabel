/**
 * The service charge an order is billed, from the tenant's own order type.
 *
 * The checkout used to send this as a number and the server stored it as sent,
 * so `serviceChargeAmount: -500` was a ₱500 discount. The server now derives it
 * with the same formula the checkout displays (`useCheckout`), against the
 * server-verified item subtotal, and ignores the browser's figure.
 */

export interface ServiceChargeRule {
  service_charge_enabled?: boolean | null
  service_charge_type?: string | null
  service_charge_value?: number | string | null
}

function toAmount(value: unknown): number {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof numeric === 'number' && Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

/** Never negative, never NaN; 0 when the order type has no service charge. */
export function computeServiceCharge(
  rule: ServiceChargeRule | null | undefined,
  itemsSubtotal: number
): number {
  if (!rule?.service_charge_enabled) return 0
  const value = toAmount(rule.service_charge_value)
  if (value === 0) return 0

  if (rule.service_charge_type === 'percentage') {
    const base = Number.isFinite(itemsSubtotal) && itemsSubtotal > 0 ? itemsSubtotal : 0
    return Math.round(base * (value / 100) * 100) / 100
  }
  return Math.round(value * 100) / 100
}
