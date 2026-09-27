/**
 * The limits of owner-initiated order deletion. Each one is a safety margin,
 * not a tuning knob: loosening any of them widens what a stolen owner session
 * can do before anyone notices.
 */

/** How long a downloaded export stays usable as the ticket to delete. */
export const EXPORT_TTL_MINUTES = 30

/** How long deleted orders stay restorable before they are erased for good. */
export const RECOVERY_DAYS = 7

/** One deletion's ceiling. The largest store today holds ~1,600 orders. */
export const MAX_ORDERS_PER_DELETION = 20_000

/** How many orders the "selected orders" mode may name at once. */
export const MAX_SELECTED_ORDERS = 500

/** Wrong passwords allowed per owner within the window below. */
export const MAX_PASSWORD_FAILURES = 5
export const PASSWORD_FAILURE_WINDOW_MINUTES = 15

/**
 * Statuses of an order someone is still waiting on. Excluded unless the owner
 * explicitly includes them, so a reset cannot erase a meal being cooked.
 */
export const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready'] as const

/** Manila is UTC+8 with no daylight saving; day boundaries use it throughout. */
export const MANILA_OFFSET_HOURS = 8

/** The header that carries the export's deletion id back to the client. */
export const DELETION_ID_HEADER = 'X-Order-Deletion-Id'
