/**
 * Per-order-type Messenger availability.
 *
 * Messenger is configurable at two levels:
 *  - tenant  (`messenger_redirect_enabled`) — whether checkout auto-opens Messenger at all
 *  - order type (`messenger_enabled`)       — whether this order type uses Messenger
 *
 * A merchant can, for example, keep Messenger for Delivery but turn it off for
 * Dine-In (kiosk/QR service). When it is off for the selected order type the
 * checkout never builds a Messenger URL, never redirects, and the CTA reads
 * "Complete Order" instead of "Send Order via Messenger".
 *
 * Both flags default to enabled so existing tenants and un-backfilled rows keep
 * their current behavior.
 */

export interface MessengerOrderTypeConfig {
  messenger_enabled?: boolean | null
}

export interface MessengerTenantConfig {
  messenger_redirect_enabled?: boolean | null
}

export const CHECKOUT_CTA_LABEL = {
  payment: 'Proceed to Payment',
  messenger: 'Send Order via Messenger',
  complete: 'Complete Order',
} as const

export const FINAL_SUBMIT_LABEL = {
  messenger: 'Order Now',
  complete: 'Complete Order',
} as const

/**
 * A kiosk overrides both flags. A counter tablet has no customer Facebook
 * account to hand off to, so opening Messenger there strands the queue on a
 * logged-out login page — or on the previous customer's inbox.
 *
 * Optional so callers that have nothing to do with kiosks (the admin order-type
 * screen) keep their current behavior with no argument at all.
 */
export interface MessengerContext {
  isKiosk?: boolean
}

/** Whether the selected order type uses Messenger. Unset → enabled. */
export function isMessengerEnabledForOrderType(
  orderType: MessengerOrderTypeConfig | null | undefined,
  context?: MessengerContext
): boolean {
  if (context?.isKiosk) return false
  return orderType?.messenger_enabled !== false
}

/** Auto-redirect requires BOTH the tenant switch and the order type to allow Messenger. */
export function isMessengerRedirectEnabledForOrderType(
  tenant: MessengerTenantConfig | null | undefined,
  orderType: MessengerOrderTypeConfig | null | undefined,
  context?: MessengerContext
): boolean {
  return (
    tenant?.messenger_redirect_enabled !== false &&
    isMessengerEnabledForOrderType(orderType, context)
  )
}

/** Label for the primary checkout CTA. */
export function resolveCheckoutCtaLabel({
  hasPaymentMethods,
  isMessengerEnabled,
}: {
  hasPaymentMethods: boolean
  isMessengerEnabled: boolean
}): string {
  if (hasPaymentMethods) return CHECKOUT_CTA_LABEL.payment
  return isMessengerEnabled ? CHECKOUT_CTA_LABEL.messenger : CHECKOUT_CTA_LABEL.complete
}

/** Label for the final submit button on the payment-details step. */
export function resolveFinalSubmitLabel({ isMessengerEnabled }: { isMessengerEnabled: boolean }): string {
  return isMessengerEnabled ? FINAL_SUBMIT_LABEL.messenger : FINAL_SUBMIT_LABEL.complete
}
