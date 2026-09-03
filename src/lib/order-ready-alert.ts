/**
 * When the customer's tracking page should audibly ring.
 *
 * Exactly on the transition into `ready` — never on first load (the customer
 * may open the page when the order is already ready; ringing then would be
 * noise, not news) and never again once rung.
 */
export function shouldRingForTransition(
  previousStatus: string | null,
  nextStatus: string,
): boolean {
  return previousStatus !== null && previousStatus !== 'ready' && nextStatus === 'ready'
}
