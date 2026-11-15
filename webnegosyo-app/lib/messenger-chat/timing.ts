/**
 * How often the Messenger chat reads look again, in one place.
 *
 * Every poll goes through React Query's `refetchInterval` (never a bare
 * timer), so it stops while the app is in the background, and the screens
 * that poll pass whether they are in view, so a tab left mounted stops too.
 */

/** An open chat (the chat screen, the pane beside the register): a new line shows up without a pull. */
export const CHAT_THREAD_REFRESH_MS = 5_000;
/** The reply box's quick actions follow the chat (a new cart, an order moving on). */
export const CHAT_TOOLS_POLL_MS = 15_000;
/** While an order waits for its customer's Confirm, its chip looks again this often. */
export const CHAT_ORDER_WAITING_POLL_MS = 20_000;
/** The queue's chat chips (who the customer is). */
export const CHAT_QUEUE_STALE_MS = 30_000;
/** One chat, the list, the confirmation records. */
export const CHAT_THREAD_STALE_MS = 10_000;
