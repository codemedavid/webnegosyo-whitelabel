/**
 * The name the admin sees for an order. A checkout that left the name field
 * empty stores `customer_name = NULL`; the admin cards used to hide the whole
 * Customer row for those, leaving the order with no identity. Resolved at
 * display time only, so the stored value stays honest for customer capture.
 */
export const GUEST_CUSTOMER_NAME = 'Guest'

export function displayCustomerName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed.length > 0 ? trimmed : GUEST_CUSTOMER_NAME
}
