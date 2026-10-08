/**
 * Checkout-lead statuses that mean "staff confirmed the payment". Pure and
 * dependency-free, so client components (the set-up page, the leads console)
 * can share the rule with the server's launch decision.
 */

const PAID_LEAD_STATUSES = new Set(['paid', 'live'])

export function isPaidLeadStatus(status: string | null | undefined): boolean {
  return PAID_LEAD_STATUSES.has(status ?? '')
}
