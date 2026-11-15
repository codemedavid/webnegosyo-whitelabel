/**
 * The Activity log sheet of an export: the Store Activity log, every page of
 * it, through the CALLER's session.
 */

import { describeActivity } from '@/lib/activity/describe'
import { MAX_ACTIVITY_PAGE, StoreActivityError, fetchStoreActivity, fetchStoreActivitySummary, type ActivityCursor, type ActivityRpcClient } from '@/lib/activity/repository'
import type { StoreActivityEvent } from '@/lib/activity/store-event'
import { CATEGORY_LABELS, FLAG_COPY } from '@/lib/activity/taxonomy'
import { manilaDate, manilaTime, text, words } from '../cells'
import { ExportError } from '../errors'
import type { ExportRow } from '../types'
import { inBranch, iso, round2, type BookSheetRows, type BookWindow } from './book-window'

/** Actions one file may list. Over it the export is refused, never cut short. */
export const MAX_ACTIVITY_ROWS = 10_000
/** A preview reads a period this small whole, so its first rows are the file's first rows. */
export const PREVIEW_FULL_ACTIVITY_ROWS = 500
const ACTIVITY_NOTE =
  'What people did: cancels, refunds, discounts, marked paid, cash in and out, price and stock changes, shift and day closes, approvals. Every order placed and every sale taking stock are in the Orders and Stock sheets, not here.'

function tooMuchActivity(): ExportError {
  return new ExportError(`There are more than ${MAX_ACTIVITY_ROWS.toLocaleString('en-PH')} actions in these dates. Pick a shorter range.`, 400)
}

function activityRefusal(error: unknown): ExportError {
  if (error instanceof ExportError) return error
  if (error instanceof StoreActivityError && error.code === 'not_allowed') return new ExportError('This account may not see the store activity log.', 403)
  return new ExportError('The activity log could not be read. Try again in a moment.', 502)
}

/**
 * The Store Activity log through the caller's session: the database decides
 * from auth.uid() whose rows come back (everyone's for the owner and
 * `activity_view`, team changes for the owner only, a branch account its branch).
 */
export async function readActivitySheet(window: BookWindow): Promise<BookSheetRows> {
  const client = window.client as unknown as ActivityRpcClient
  const since = iso(window.start)
  const until = iso(window.end)
  const outletId = window.branch.p_outlet
  const events: StoreActivityEvent[] = []
  /** A preview's count of the whole period, from the roll-up. */
  let counted: number | null = null
  let cursor: ActivityCursor | null = null
  try {
    // "No branch yet" is not a filter the log has: those rows are picked out below, so nothing can count them first.
    if (window.peek !== null && !window.branch.p_unassigned) {
      // The roll-up counts the same rows the list returns (not routine, same visibility).
      const summary = await fetchStoreActivitySummary(client, window.tenantId, { since, until, outletId })
      counted = summary.byKind.reduce((sum, line) => sum + line.count, 0)
      if (counted > MAX_ACTIVITY_ROWS) throw tooMuchActivity()
    }
    for (;;) {
      const page = await fetchStoreActivity(client, window.tenantId, { limit: MAX_ACTIVITY_PAGE, cursor, since, until, outletId, includeRoutine: false })
      events.push(...page.events)
      cursor = page.nextCursor
      if (cursor === null) break
      // A preview of a busy period reads the newest page only.
      if (window.peek !== null && (counted === null || counted > PREVIEW_FULL_ACTIVITY_ROWS)) break
      if (events.length > MAX_ACTIVITY_ROWS) throw tooMuchActivity()
    }
  } catch (error) {
    throw activityRefusal(error)
  }
  const isWhole = cursor === null
  const rows = events
    .filter((event) => inBranch(event.outletId, window.branch))
    // The log is read newest first; a file reads from the start of the period.
    .reverse()
    .map((event): ExportRow => {
      const at = Date.parse(event.occurredAt)
      const described = describeActivity(event)
      return {
        date: manilaDate(at),
        time: manilaTime(at),
        branch: text(event.outletName),
        category: CATEGORY_LABELS[event.category] ?? words(event.category),
        what: described.title,
        details: text(described.subtitle),
        who: text(event.actorName),
        approved_by: text(event.approvedByName),
        amount: event.amount === null ? null : round2(event.amount),
        quantity: event.quantity,
        unit: text(event.unit),
        order_no: text(event.orderNumber),
        reason: text(event.reason),
        note: text(event.note),
        needs_look: text(event.flags.map((flag) => FLAG_COPY[flag]?.explanation ?? words(flag)).join(' ')),
        reviewed_by: text(event.reviewedByName),
      }
    })
  // The log is read newest first, so a part-read preview holds the latest actions, not the file's first rows.
  return { rows, total: isWhole ? rows.length : counted, notes: isWhole ? [ACTIVITY_NOTE] : [ACTIVITY_NOTE, 'This preview shows the most recent actions. The file starts from the first day.'] }
}
