/**
 * Pure presell arithmetic: what each date has left, what a stepper may reach,
 * and the one-date-per-cart rule.
 *
 * Presell inverts the ingredient system's default. There, untracked means
 * UNLIMITED — a dish with no recipe behaves as before inventory existed. A
 * presell item with no allocation on a date means ZERO: the whole point of
 * presell is that only allocated dates are sellable, so the missing row is the
 * refusal, not the exemption.
 *
 * Dates are plain YYYY-MM-DD strings in the store's business day sense, which
 * makes "before today" a lexicographic comparison and keeps timezones out of
 * this file entirely.
 */

/** Below this many remaining, the copy says so. Mirrors stepper-cap. */
export const PRESELL_HINT_THRESHOLD = 10

/** One presell_stock row, as narrow as the arithmetic needs it. */
export interface PresellAllocationRow {
  menu_item_id: string
  presell_date: string
  stock_qty: number
  sold_qty: number
}

/** Remaining per date for ONE menu item. Zero stays present — it renders as "sold out". */
export type PresellCalendar = ReadonlyMap<string, number>

/** One aggregated cart demand: this many of this item on this date. */
export interface PresellCartLine {
  menuItemId: string
  presellDate: string
  quantity: number
}

/** What a date still offers. Never negative, even after the merchant lowered stock below sold. */
export function resolvePresellRemaining(stockQty: number, soldQty: number): number {
  return Math.max(0, stockQty - soldQty)
}

/**
 * The month view's data: date → remaining, past dates dropped, sold-out dates
 * kept at zero so the calendar can say "sold out" instead of showing a gap.
 */
export function buildPresellCalendar(
  rows: readonly PresellAllocationRow[],
  todayKey: string,
): PresellCalendar {
  const calendar = new Map<string, number>()
  for (const row of rows) {
    if (row.presell_date < todayKey) continue
    calendar.set(row.presell_date, resolvePresellRemaining(row.stock_qty, row.sold_qty))
  }
  return calendar
}

/**
 * How many MORE of a presell item may be added for a date.
 *
 * `remaining` is `null` when the date has no allocation (or none is known) —
 * which for presell means zero, never unlimited. `alreadyInCart` is what the
 * cart holds of this item FOR THIS DATE.
 */
export function resolvePresellAddable(
  remaining: number | null,
  alreadyInCart: number,
  hardMax: number,
): number {
  if (remaining === null) return 0
  return Math.min(Math.max(0, remaining - alreadyInCart), hardMax)
}

/**
 * The line of copy under a presell stepper, or `null` when there is nothing
 * worth saying. Same voice as `describeRemainingStock`, scoped to the date:
 * "sold out" is about the shop's allocation, "that's all" is about the
 * customer's own cart.
 */
export function describePresellRemaining(
  remaining: number | null,
  alreadyInCart: number,
): string | null {
  if (remaining === null) return null
  if (remaining <= 0) return 'Sold out for this date'

  const addable = Math.max(0, remaining - alreadyInCart)
  if (addable <= 0) return 'That’s all available for this date'
  if (addable > PRESELL_HINT_THRESHOLD) return null

  return `Only ${addable} left for this date`
}

/**
 * The single date this cart is committed to, or `null` when it holds no
 * presell lines. An order has one `scheduled_for`, so a cart never mixes
 * presell dates — `addItem` enforces it, this reads it.
 */
export function findCartPresellDate(
  items: readonly { presell_date?: string }[],
): string | null {
  for (const item of items) {
    if (item.presell_date) return item.presell_date
  }
  return null
}

/** The shape `collectPresellLines` reads — a sliver of `CartItem`. */
interface PresellCartSource {
  menu_item: { id: string }
  quantity: number
  presell_date?: string
}

/**
 * The cart's presell demand, aggregated per (item, date) — two lines of the
 * same bilao on the same date are one claim of five, exactly how the guard
 * and the SQL function must judge them.
 */
export function collectPresellLines(
  items: readonly PresellCartSource[],
): PresellCartLine[] {
  const byKey = new Map<string, PresellCartLine>()
  for (const item of items) {
    if (!item.presell_date) continue
    const key = `${item.menu_item.id}|${item.presell_date}`
    const existing = byKey.get(key)
    if (existing) {
      byKey.set(key, { ...existing, quantity: existing.quantity + item.quantity })
    } else {
      byKey.set(key, {
        menuItemId: item.menu_item.id,
        presellDate: item.presell_date,
        quantity: item.quantity,
      })
    }
  }
  return [...byKey.values()]
}

/**
 * The date this cart is already committed to, when it differs from the one
 * being offered — `null` when the new line may join. An order has a single
 * `scheduled_for`, so a second presell date is refused at the cart, where the
 * customer can still choose, rather than at checkout.
 */
export function findPresellDateConflict(
  items: readonly { presell_date?: string }[],
  presellDate: string,
): string | null {
  const committed = findCartPresellDate(items)
  if (committed === null || committed === presellDate) return null
  return committed
}

/**
 * What the cart already holds of one dish on one date, across every
 * configuration of it. `excludeLineId` leaves out the line a stepper is about
 * to change, so that line's own quantity is not counted against itself.
 */
export function countPresellInCart(
  items: readonly (PresellCartSource & { id: string })[],
  menuItemId: string,
  presellDate: string,
  excludeLineId?: string,
): number {
  return items.reduce((sum, item) => {
    if (item.id === excludeLineId) return sum
    if (item.menu_item.id !== menuItemId || item.presell_date !== presellDate) return sum
    return sum + item.quantity
  }, 0)
}

/** The slice of `CartItem` the re-check needs; `subtotal` is re-derived per unit. */
interface ReconcilableLine extends PresellCartSource {
  id: string
  subtotal: number
}

export interface PresellReconcileResult<T> {
  items: T[]
  removed: T[]
  hasChanges: boolean
}

/**
 * Fit the cart's presell lines to what their dates have left.
 *
 * Runs inside the cart's periodic re-check, next to the "dish went
 * unavailable" pass: a date that sold out while the tab sat in the background
 * shrinks its line to the remainder (re-priced per unit) or drops it. Dishes
 * whose calendar was not re-read are left alone — absent means "could not
 * check", never "gone". Earlier lines keep their quantity first, so the
 * customer's original choice survives and only the later duplicate shrinks.
 */
export function reconcilePresellLines<T extends ReconcilableLine>(
  items: readonly T[],
  calendars: ReadonlyMap<string, PresellCalendar>,
): PresellReconcileResult<T> {
  const budget = new Map<string, number>()
  const kept: T[] = []
  const removed: T[] = []
  let hasChanges = false

  for (const item of items) {
    const calendar = item.presell_date ? calendars.get(item.menu_item.id) : undefined
    if (!item.presell_date || !calendar) {
      kept.push(item)
      continue
    }
    const key = `${item.menu_item.id}|${item.presell_date}`
    const left = budget.get(key) ?? (calendar.get(item.presell_date) ?? 0)
    const allowed = Math.max(0, Math.min(item.quantity, left))
    budget.set(key, left - allowed)

    if (allowed === 0) {
      removed.push(item)
      hasChanges = true
      continue
    }
    if (allowed === item.quantity) {
      kept.push(item)
      continue
    }
    const unit = item.subtotal / item.quantity
    kept.push({ ...item, quantity: allowed, subtotal: unit * allowed })
    hasChanges = true
  }

  return hasChanges ? { items: kept, removed, hasChanges } : { items: items as T[], removed, hasChanges }
}
