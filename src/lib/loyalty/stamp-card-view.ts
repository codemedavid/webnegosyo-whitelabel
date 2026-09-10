/**
 * Which face of the loyalty card the tracking page shows.
 *
 * Pure, because the old page decided this inline with a single condition
 * (`hasContact === false`) and got it wrong in both directions: a customer who
 * had just claimed watched the card vanish on the next poll, and a customer
 * whose number was taken at the counter never saw their stamps at all.
 */

export type StampCardView =
  /** The claim form: the store has a live offer and this order is unclaimed. */
  | 'claim'
  /** The card itself: this order earned, here is the balance. */
  | 'card'
  /** Claimed (or taken at the counter) and waiting on the order to complete. */
  | 'awaiting'
  /** The offer is real but this order is finished and was never claimed. */
  | 'closed'
  /** No loyalty offer — just the plain "save my number" capture. */
  | 'contact_only'
  | 'hidden'

export interface StampCardViewInput {
  /** Whether the store has a live, non-shadow offer to talk about. */
  hasOffer: boolean
  /** Whether a real contact is already on the order. */
  hasContact: boolean
  /** Whether the order may still be claimed (see `claim-window`). */
  isClaimOpen: boolean
  /** Whether this order has an earned stamp to show. */
  hasCard: boolean
  isCancelled: boolean
}

export function decideStampCardView(input: StampCardViewInput): StampCardView {
  if (input.isCancelled) return 'hidden'
  // An earned stamp outlives the window: it is the customer's, and a refresh
  // days later must still show it.
  if (input.hasCard) return 'card'

  if (!input.hasOffer) {
    return !input.hasContact && input.isClaimOpen ? 'contact_only' : 'hidden'
  }

  if (input.hasContact) {
    // The number is on the order and the stamp lands at completion. Once the
    // order IS complete and no stamp arrived, saying so would be a promise
    // nothing is going to keep.
    return input.isClaimOpen ? 'awaiting' : 'hidden'
  }

  return input.isClaimOpen ? 'claim' : 'closed'
}
