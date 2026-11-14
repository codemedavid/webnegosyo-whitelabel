/**
 * The Store Activity log (who did what, when) shaped for Owl. Pure.
 *
 * The model reads one short sentence per entry (`describeActivity`, the same
 * words as the app's Activity screen), the person as a staff ref + label, the
 * order number and the amount: never ids, and never the masked customer in
 * the row's summary. Flags travel as their plain explanation.
 */

import { describeActivity } from '@/lib/activity/describe'
import { formatManilaDay, formatManilaTime } from '@/lib/activity/format'
import { FLAG_COPY, type ActivityKind } from '@/lib/activity/taxonomy'
import type { StoreActivityEvent, StoreActivitySummary } from '@/lib/activity/store-event'
import { staffLabel } from '@/lib/assistant/insights/customer-label'
import { whenFacts, type ResolvedWhen } from '@/lib/assistant/insights/when'
import type { RefBook } from '@/lib/assistant/refs'
import type { RankedCard, ToolResult } from '@/lib/assistant/types'

/** Entries the model reads; the card shows the same ones. */
export const ACTIVITY_ENTRY_LIMIT = 25
const KIND_TOTAL_LIMIT = 14
const PEOPLE_LIMIT = 10

/** One phrase per kind, for the roll-up ("Orders cancelled: 4"). Typed exhaustively. */
export const KIND_WORDS: Readonly<Record<ActivityKind, string>> = {
  'order.cancelled': 'Orders cancelled',
  'order.reopened': 'Orders reopened',
  'order.edited': 'Orders edited',
  'order.deleted': 'Orders deleted',
  'order.placed': 'Orders placed',
  'order.status_changed': 'Order status changes',
  'order.completed': 'Orders completed',
  'refund.issued': 'Refunds',
  'payment.recorded': 'Payments recorded',
  'payment.marked_paid': 'Marked paid',
  'payment.proof_approved': 'Payment proofs approved',
  'payment.proof_rejected': 'Payment proofs rejected',
  'discount.applied': 'Discounts given',
  'voucher.redeemed': 'Vouchers used',
  'voucher.released': 'Vouchers given back',
  'payment.charged': 'Payments charged',
  'shift.opened': 'Shifts opened',
  'shift.closed': 'Shifts closed',
  'cash.pay_in': 'Cash put in the drawer',
  'cash.pay_out': 'Cash taken out of the drawer',
  'cash.collected': 'Cash collected',
  'receipt.reprinted': 'Receipts reprinted',
  'shift.reconciled': 'Drawers counted',
  'cash.remitted': 'Cash handed over',
  'cash.remittance_accepted': 'Hand-overs accepted',
  'cash.remittance_disputed': 'Hand-overs disputed',
  'cash.remittance_resolved': 'Hand-over disputes settled',
  'day.closed': 'Days closed',
  'day.reopened': 'Days reopened',
  'day.deposit_recorded': 'Bank deposits recorded',
  'stock.received': 'Deliveries received',
  'stock.wasted': 'Stock wasted',
  'stock.counted': 'Stock counts',
  'stock.adjusted': 'Stock corrections',
  'stock.transfer_sent': 'Transfers sent',
  'stock.transfer_received': 'Transfers received',
  'stock.duplicate_blocked': 'Double deductions blocked',
  'stock.alert': 'Low-stock alerts',
  'stock.sale': 'Stock used by sales',
  'stock.restored': 'Stock put back',
  'stock.oversold': 'Sold past stock',
  'loyalty.reward_claimed': 'Rewards claimed',
  'loyalty.reward_voided': 'Rewards voided',
  'loyalty.stamps_adjusted': 'Stamps adjusted',
  'loyalty.program_changed': 'Loyalty program changes',
  'loyalty.stamps_earned': 'Stamps earned',
  'loyalty.reward_issued': 'Rewards earned',
  'menu.price_changed': 'Prices changed',
  'menu.availability_changed': 'Sold out / back on',
  'menu.item_added': 'Dishes added',
  'menu.item_removed': 'Dishes removed',
  'staff.added': 'Staff added',
  'staff.removed': 'Staff removed',
  'staff.access_changed': 'Staff access changed',
  'settings.changed': 'Settings changed',
  'rules.changed': 'Rules changed',
  'assistant.action_confirmed': 'Owl changes confirmed',
  'campaign.status_changed': 'SMS campaigns switched',
  'voucher.status_changed': 'Vouchers switched',
  'approval.requested': 'Approvals asked for',
  'approval.approved': 'Approvals given',
  'approval.declined': 'Approvals declined',
  'approval.expired': 'Approvals expired',
  'approval.withdrawn': 'Approvals withdrawn',
  'approval.executed': 'Approved actions done',
  'approval.failed': 'Approved actions failed',
  'expense.recorded': 'Expenses recorded',
  'expense.voided': 'Expenses voided',
}

export interface ActivityLogFilters {
  staffRef: string | null
  category: string | null
  order: string | null
  search: string | null
  flaggedOnly: boolean
  includeRoutine: boolean
}

export interface ActivityLogInput {
  when: ResolvedWhen
  events: readonly StoreActivityEvent[]
  /** Store-wide roll-up for the window; null when filters make it misleading or it could not be read. */
  summary: StoreActivitySummary | null
  hasMore: boolean
  filters: ActivityLogFilters
  refs: RefBook
  nowIso: string
}

function roundPesos(amount: number | null): number | null {
  return amount === null ? null : Math.round(amount * 100) / 100
}

function whoOf(event: StoreActivityEvent, refs: RefBook): { who: string; ref?: string } {
  if (!event.actorUserId) return { who: event.actorName ? staffLabel(event.actorName) : 'Online / system' }
  return { who: staffLabel(event.actorName ?? 'Staff member'), ref: refs.refFor('staff', event.actorUserId) }
}

function timeOf(event: StoreActivityEvent, when: ResolvedWhen, nowIso: string): string {
  const time = formatManilaTime(event.occurredAt)
  return when.dayCount === 1 ? time : `${formatManilaDay(event.occurredAt, nowIso)} ${time}`
}

function summaryFacts(summary: StoreActivitySummary, refs: RefBook) {
  const totals = [...summary.byKind]
    .sort((a, b) => b.count - a.count)
    .slice(0, KIND_TOTAL_LIMIT)
    .map((row) => ({
      what: row.statutory ? `${KIND_WORDS[row.kind]} (Senior/PWD)` : KIND_WORDS[row.kind],
      count: row.count,
      ...(row.amount !== null && row.amount !== 0 ? { amount: roundPesos(row.amount) } : {}),
    }))

  const people = new Map<string, { who: string; ref?: string; actions: number; top: Map<ActivityKind, number> }>()
  for (const row of summary.byActor) {
    const key = row.actorUserId ?? 'none'
    const person = people.get(key) ?? {
      who: row.actorUserId ? staffLabel(row.actorName ?? 'Staff member') : 'Online / system',
      ...(row.actorUserId ? { ref: refs.refFor('staff', row.actorUserId) } : {}),
      actions: 0,
      top: new Map<ActivityKind, number>(),
    }
    person.actions += row.count
    person.top.set(row.kind, (person.top.get(row.kind) ?? 0) + row.count)
    people.set(key, person)
  }
  const byPerson = [...people.values()]
    .sort((a, b) => b.actions - a.actions)
    .slice(0, PEOPLE_LIMIT)
    .map(({ top, ...person }) => ({
      ...person,
      mostly: [...top.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([kind, count]) => `${KIND_WORDS[kind]}: ${count}`),
    }))

  return {
    totals,
    byPerson,
    ...(summary.routine.length > 0
      ? { routine: summary.routine.map((row) => ({ what: KIND_WORDS[row.kind], count: row.count })) }
      : {}),
    needsALook: summary.flaggedOpen,
  }
}

function card(input: ActivityLogInput, shown: readonly StoreActivityEvent[]): RankedCard {
  return {
    type: 'ranked',
    title: input.filters.flaggedOnly ? 'Needs a look' : 'Store activity',
    subtitle: `${input.when.label}${input.hasMore ? ` · latest ${shown.length}` : ''}`,
    rows: shown.map((event) => {
      const described = describeActivity(event)
      const time = timeOf(event, input.when, input.nowIso)
      return {
        label: described.title,
        value: described.amountLabel ?? '',
        detail: [time, described.subtitle].filter(Boolean).join(' · '),
        ...(event.flags.length > 0 ? { badge: 'Check' } : {}),
      }
    }),
    emptyText: 'Nothing recorded for this period.',
  }
}

export function buildActivityLogResult(input: ActivityLogInput): ToolResult {
  const { when, events, summary, hasMore, filters, refs, nowIso } = input
  const shown = events.slice(0, ACTIVITY_ENTRY_LIMIT)
  const entries = shown.map((event) => {
    const described = describeActivity(event, { showBranch: true })
    return {
      at: timeOf(event, when, nowIso),
      ...whoOf(event, refs),
      what: described.title,
      ...(described.subtitle ? { detail: described.subtitle } : {}),
      ...(event.amount !== null && event.amount !== 0 ? { amount: roundPesos(event.amount) } : {}),
      ...(event.orderNumber ? { order: event.orderNumber } : {}),
      ...(event.flags.length > 0 ? { check: event.flags.map((flag) => FLAG_COPY[flag].explanation) } : {}),
    }
  })

  const appliedFilters = Object.fromEntries(
    Object.entries({
      staff: filters.staffRef,
      category: filters.category,
      order: filters.order,
      search: filters.search,
      flaggedOnly: filters.flaggedOnly || null,
      includeRoutine: filters.includeRoutine || null,
    }).filter(([, value]) => value !== null),
  )

  return {
    facts: {
      ...whenFacts(when),
      ...(Object.keys(appliedFilters).length > 0 ? { filters: appliedFilters } : {}),
      ...(summary ? { storeWide: summaryFacts(summary, refs) } : {}),
      entries,
      ...(hasMore || events.length > shown.length
        ? { more: `Only the latest ${shown.length} entries are listed; narrow by person, category or time for older ones.` }
        : {}),
      ...(entries.length === 0
        ? { note: filters.includeRoutine ? 'Nothing recorded.' : 'Nothing out of the ordinary recorded (routine order and stock lines are hidden; includeRoutine shows them).' }
        : {}),
      amountsAre: 'pesos; negative = money out',
    },
    card: card(input, shown),
    chips: [
      { label: 'Anything to check?', prompt: `Anything that needs a look (${when.label.toLowerCase()})?` },
      { label: 'Sales for this period', prompt: `How were sales (${when.label.toLowerCase()})?` },
    ],
  }
}

/** "42" / "#42" / "#042" → the label the log stores ("#42", "#07"). */
export function orderLabel(raw: string): string | null {
  const digits = raw.trim().replace(/^#/, '')
  if (!/^\d{1,6}$/.test(digits)) return null
  const number = Number(digits)
  return number > 0 ? `#${String(number).padStart(2, '0')}` : null
}
