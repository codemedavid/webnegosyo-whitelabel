/**
 * What the merchant sees in an order's "Customer" panel.
 *
 * `customerData` is a carrier, not a form: alongside the details the customer
 * typed, it ferries the internals every backend needs — the scheduled instant,
 * the delivery coordinates, the Messenger PSID, the branch, and the presell
 * claim id, date and line list. The panel is a list of `label: value` rows, so
 * anything internal reads as a mystery field to a merchant and anything
 * object-shaped reads as "[object Object]".
 *
 * Two rules keep it honest:
 *   - a denylist for keys whose meaning is already shown better elsewhere (the
 *     pre-order banner, the delivery card, the branch chip);
 *   - a shape rule: a value that cannot be written on one line is dropped,
 *     whatever its key. That covers every carrier key added after this file.
 */

/** Keys whose meaning the sheet already shows somewhere better. */
const CARRIER_KEYS: ReadonlySet<string> = new Set([
  // The pre-order banner states the date in words; the rest is bookkeeping the
  // cancel path reads and a merchant never needs to see.
  'presell_claim_id',
  'presell_date',
  'presell_lines',
  // The scheduled instant behind that same banner.
  'scheduled_for',
  'scheduled_for_label',
  // The delivery card shows the address; coordinates are for the courier.
  'delivery_lat',
  'delivery_lng',
  // Routing internals.
  'messenger_psid',
  'outlet_id',
  'outlet_name',
])

export interface CustomerField {
  key: string
  /** The key as a person reads it. */
  label: string
  /** Always a string, so the caller never stringifies an object by accident. */
  value: string
}

/** The rows to render, in the order the data carries them. */
export function visibleCustomerFields(customerData: unknown): CustomerField[] {
  if (!customerData || typeof customerData !== 'object') return []

  return Object.entries(customerData as Record<string, unknown>)
    .filter(([key, value]) => {
      if (CARRIER_KEYS.has(key)) return false
      if (value === null || value === undefined || value === '') return false
      // A row is one line. Objects and arrays have no one-line form here.
      return typeof value !== 'object'
    })
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' '),
      value: String(value),
    }))
}
