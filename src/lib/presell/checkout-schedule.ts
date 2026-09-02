import { combineDateAndTime, type AdvanceOrderConfig, type ScheduleDateOption } from '@/lib/advance-order-utils'
import type { PresellCartLine } from '@/lib/presell/availability'

/**
 * How a presell cart takes over the advance-order scheduler.
 *
 * The scheduler stays the mechanism — one `scheduled_for`, the same dual
 * write, the same version-guarded Convex arg — but the presell date is not a
 * choice: ASAP goes away, the horizon stretches to reach the date, and the
 * date list collapses to that one day. Only the time is left to pick.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Order-type scheduling, forced on and stretched to cover the presell date. */
export function presellAdvanceConfig(
  config: AdvanceOrderConfig,
  presellDate: string,
  now: Date,
): AdvanceOrderConfig {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = combineDateAndTime(presellDate, '00:00')
  const daysAhead = Math.max(0, Math.round((target.getTime() - today.getTime()) / MS_PER_DAY))
  return {
    ...config,
    enabled: true,
    allowAsap: false,
    maxDaysAhead: Math.max(config.maxDaysAhead, daysAhead),
  }
}

/**
 * The date list, reduced to the presell date. Synthesized when the generator
 * skipped that day (a closed weekday, say): the merchant allocated stock to
 * it, so it is sellable whatever the weekly hours say.
 */
export function presellScheduleDates(
  dates: readonly ScheduleDateOption[],
  presellDate: string,
): ScheduleDateOption[] {
  const existing = dates.find((d) => d.value === presellDate)
  if (existing) return [existing]
  const day = combineDateAndTime(presellDate, '00:00')
  return [{
    value: presellDate,
    label: `${WEEKDAYS[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}`,
    isToday: false,
  }]
}

// ── customer_data carriage ────────────────────────────────────────────────
// The claim that reserved the stock travels with the order on every backend
// (platform Supabase, tenant Supabase, Convex all store customer_data), so a
// cancel path anywhere can find what to release.

export const PRESELL_DATE_KEY = 'presell_date'
export const PRESELL_CLAIM_ID_KEY = 'presell_claim_id'
export const PRESELL_LINES_KEY = 'presell_lines'

export interface PresellClaimRecord {
  presellDate: string
  claimId: string
  lines: PresellCartLine[]
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function withPresellCustomerData(
  customerData: Record<string, unknown> | undefined,
  claim: PresellClaimRecord,
): Record<string, unknown> {
  return {
    ...(customerData ?? {}),
    [PRESELL_DATE_KEY]: claim.presellDate,
    [PRESELL_CLAIM_ID_KEY]: claim.claimId,
    [PRESELL_LINES_KEY]: claim.lines.map((l) => ({
      menu_item_id: l.menuItemId,
      presell_date: l.presellDate,
      quantity: l.quantity,
    })),
  }
}

function isLineRecord(value: unknown): value is { menu_item_id: string; presell_date: string; quantity: number } {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.menu_item_id === 'string'
    && typeof v.presell_date === 'string'
    && DATE_KEY_PATTERN.test(v.presell_date)
    && typeof v.quantity === 'number'
}

/** The claim an order carries, or null when it was never a pre-order (or the record is unreadable). */
export function readPresellClaim(customerData: unknown): PresellClaimRecord | null {
  if (!customerData || typeof customerData !== 'object') return null
  const cd = customerData as Record<string, unknown>
  const presellDate = cd[PRESELL_DATE_KEY]
  const claimId = cd[PRESELL_CLAIM_ID_KEY]
  const rawLines = cd[PRESELL_LINES_KEY]
  if (typeof presellDate !== 'string' || !DATE_KEY_PATTERN.test(presellDate)) return null
  if (typeof claimId !== 'string' || claimId.length === 0) return null
  if (!Array.isArray(rawLines) || !rawLines.every(isLineRecord)) return null
  return {
    presellDate,
    claimId,
    lines: rawLines.map((l) => ({ menuItemId: l.menu_item_id, presellDate: l.presell_date, quantity: l.quantity })),
  }
}
