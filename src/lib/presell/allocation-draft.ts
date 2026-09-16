/**
 * What the merchant has typed into the allocation panel but not yet saved.
 *
 * The panel used to write straight through: one server action per date, per
 * keystroke. Every one of those revalidated the route the merchant was
 * standing on, so the editor re-rendered under them mid-edit — the "it keeps
 * refreshing" they reported — and a half-finished edit could land while a
 * later one was still in flight. Now the panel edits this draft and the whole
 * thing is written once, when "Update Menu Item" is pressed.
 *
 * Pure and immutable, like `admin-allocations.ts` beside it: every function
 * returns a new draft. `soldQty` is carried read-only — it is the record of
 * sales and moves only through apply_presell_order() — but it is what stops a
 * merchant promising fewer than they have already sold, so the clamp lives
 * here rather than in each surface that edits a figure.
 */

import type { PresellStock } from '@/types/database'

/** One date's promise, as the panel holds it while editing. */
export interface DraftAllocation {
  presellDate: string
  stockQty: number
  /** Sales already recorded. Server-owned; the draft never writes it. */
  soldQty: number
}

/** The writes one save has to make. Dates absent from both lists are untouched. */
export interface AllocationDiff {
  upserts: { presellDate: string; stockQty: number }[]
  deletes: string[]
}

const byDate = (a: DraftAllocation, b: DraftAllocation) => a.presellDate.localeCompare(b.presellDate)

/** The draft a saved dish opens with. */
export function draftFromRows(rows: readonly PresellStock[]): DraftAllocation[] {
  return rows
    .map((row) => ({
      presellDate: row.presell_date,
      stockQty: row.stock_qty,
      soldQty: row.sold_qty,
    }))
    .sort(byDate)
}

/**
 * Offer `stockQty` on `presellDate`, adding the date if it was not on offer.
 *
 * Never drops below what already sold: lowering stock is how a merchant stops
 * selling more, but a figure under the sold count would make "remaining"
 * negative and would be a promise already broken.
 */
export function setDraftStock(
  current: readonly DraftAllocation[],
  presellDate: string,
  stockQty: number,
): DraftAllocation[] {
  const existing = current.find((entry) => entry.presellDate === presellDate)
  const soldQty = existing?.soldQty ?? 0
  const next: DraftAllocation = {
    presellDate,
    stockQty: Math.max(stockQty, soldQty, 0),
    soldQty,
  }
  return [...current.filter((entry) => entry.presellDate !== presellDate), next].sort(byDate)
}

/** Stop offering a date entirely. Refused at save time if it has sales. */
export function removeDraftDate(
  current: readonly DraftAllocation[],
  presellDate: string,
): DraftAllocation[] {
  return current.filter((entry) => entry.presellDate !== presellDate)
}

/** Fill a run of dates with one figure, each clamped to its own sold count. */
export function fillDraftRange(
  current: readonly DraftAllocation[],
  presellDates: readonly string[],
  stockQty: number,
): DraftAllocation[] {
  return presellDates.reduce<DraftAllocation[]>(
    (draft, presellDate) => setDraftStock(draft, presellDate, stockQty),
    [...current],
  )
}

/**
 * The writes that turn `original` into `next`.
 *
 * Only `stockQty` is compared. A sold count that moved while the editor was
 * open belongs to a customer's order, not to this edit, so it must never be
 * written back — that is how a merchant saving an old screen would un-sell
 * someone's pre-order.
 */
export function diffDraft(
  original: readonly DraftAllocation[],
  next: readonly DraftAllocation[],
): AllocationDiff {
  const before = new Map(original.map((entry) => [entry.presellDate, entry.stockQty]))
  const after = new Set(next.map((entry) => entry.presellDate))

  return {
    upserts: next
      .filter((entry) => before.get(entry.presellDate) !== entry.stockQty)
      .map((entry) => ({ presellDate: entry.presellDate, stockQty: entry.stockQty })),
    deletes: original
      .filter((entry) => !after.has(entry.presellDate))
      .map((entry) => entry.presellDate),
  }
}

/** Whether saving the dish has any allocation work to do. */
export function isDraftDirty(
  original: readonly DraftAllocation[],
  next: readonly DraftAllocation[],
): boolean {
  const diff = diffDraft(original, next)
  return diff.upserts.length > 0 || diff.deletes.length > 0
}

/**
 * Removed dates that the server will refuse, so the panel can say so before
 * the merchant presses save rather than after. Deleting a sold date would
 * erase the only record of what was promised; lowering its stock to the sold
 * count is the way to stop selling more.
 */
export function findUnremovableDates(
  original: readonly DraftAllocation[],
  next: readonly DraftAllocation[],
): string[] {
  const kept = new Set(next.map((entry) => entry.presellDate))
  return original
    .filter((entry) => !kept.has(entry.presellDate) && entry.soldQty > 0)
    .map((entry) => entry.presellDate)
}
