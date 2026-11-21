/**
 * When the website cart tells the customer's Messenger chat about itself
 * (`/api/messenger/send-cart`, debounced in `useCart`).
 *
 * Only a change the customer makes on the website is worth a message. Three
 * changes are not, and each used to put a confusing line in the chat:
 *
 * - the cart as this page view found it (the first look). Every full page load
 *   with a Messenger link used to send it again, so opening the menu from the
 *   chat with an empty cart answered "Your cart at … is empty";
 * - the chat's own cart arriving on the website (Checkout in Messenger), which
 *   echoed "Your cart at …: 2 items" right back to the chat;
 * - the cart emptied after the order was placed (`clearCart`), which followed
 *   the order summary with "Your cart at … is empty".
 *
 * `adopt` = remember this cart as already known to the chat, send nothing.
 */
export type WebCartSyncStep = 'adopt' | 'skip' | 'send'

export interface WebCartSyncInput {
  cartHash: string
  /** The cart the chat already knows about; null before this page view's first look. */
  lastKnown: string | null
  /** The change came from the chat itself or from placing the order. */
  isQuiet: boolean
  /** A Messenger link and a store are known, so a message could go out. */
  canSend: boolean
}

export function webCartSyncStep({ cartHash, lastKnown, isQuiet, canSend }: WebCartSyncInput): WebCartSyncStep {
  if (lastKnown === null || isQuiet) return 'adopt'
  if (!canSend || cartHash === lastKnown) return 'skip'
  return 'send'
}
