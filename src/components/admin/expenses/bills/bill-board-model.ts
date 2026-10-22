/**
 * "Bills to pay" on the web, as data (docs/plans/expenses/bills-contract.md §5).
 *
 * Pure. The shared engine (`@/lib/expenses/bill-schedule`) decides every due
 * date, state and estimate; this file only sorts its occurrences into the
 * board's groups and words them the way the owner reads them: "2 days late",
 * "Due Thu", "about ₱6,200".
 *
 * A bill is a reminder: nothing here counts money as spent. Paying a bill is
 * an ordinary expense (the Add expense dialog, pre-filled by `paymentPrefill`).
 */

import {
  OPEN_STATES,
  billsDue,
  estimateCents,
  monthKeyOf,
  nextDueDates,
  paymentsOwed,
  stillToPay,
  type Bill,
  type BillMark,
  type BillPayment,
  type Occurrence,
  type OccurrenceState,
  type StillToPay,
} from '@/lib/expenses/bill-schedule'
import { addDays, daysBetween } from '@/lib/expenses/manila-date'
import type { Expense } from '@/lib/expenses/types'
import type { ExpenseFormState } from '../expense-form-model'
import { formatPeso } from '../expense-format'

/** "This week" = due today or in the next 6 days. */
export const THIS_WEEK_DAYS = 7
/** "I already recorded it" offers expenses this many days either side of the due date. */
export const LINK_WINDOW_DAYS = 10

export type BoardGroupId = 'late' | 'this_week' | 'later' | 'paid'

export const BOARD_GROUP_ORDER: readonly BoardGroupId[] = ['late', 'this_week', 'later', 'paid']

export const BOARD_GROUP_LABELS: Readonly<Record<BoardGroupId, string>> = {
  late: 'Late',
  this_week: 'This week',
  later: 'Later',
  paid: 'Paid this month',
}

export interface BoardRow {
  /** Stable per bill + due date. */
  key: string
  bill: Bill
  occurrence: Occurrence
}

export interface BoardGroup {
  id: BoardGroupId
  label: string
  rows: BoardRow[]
}

export interface BillBoardView {
  summary: StillToPay
  /** Only groups with rows, in board order. */
  groups: BoardGroup[]
  paused: Bill[]
  stopped: Bill[]
}

export interface BoardInput {
  bills: readonly Bill[]
  marks: readonly BillMark[]
  payments: readonly BillPayment[]
  /** Manila business date. */
  today: string
}

export function groupOf(occurrence: Occurrence, today: string): BoardGroupId {
  if (occurrence.state === 'paid' || occurrence.state === 'skipped') return 'paid'
  if (occurrence.state === 'late') return 'late'
  return daysBetween(today, occurrence.dueOn) < THIS_WEEK_DAYS ? 'this_week' : 'later'
}

/**
 * An active bill whose next due date is past the board's horizon (a yearly
 * permit, a bill paid ahead) would vanish from the board, and with it every way
 * to edit it. It shows under Later on its next due date instead.
 */
function nextRowFor(bill: Bill, input: BoardInput): Occurrence | null {
  const [next] = nextDueDates(bill, input.today, 1, input.payments)
  if (next === undefined) return null
  const estimate = estimateCents(bill, input.payments)
  return {
    billId: bill.id,
    dueOn: next,
    state: 'upcoming',
    amountCents: estimate,
    isEstimate: bill.amountCents === null && estimate !== null,
    payment: null,
    daysLate: 0,
    lateCount: 0,
    lateDueOns: [],
    snoozedUntil: null,
  }
}

export function buildBillBoard(input: BoardInput): BillBoardView {
  const context = { today: input.today, payments: input.payments, marks: input.marks }
  const occurrences = billsDue(input.bills, context)
  const billById = new Map(input.bills.map((bill) => [bill.id, bill]))
  const withOpenRow = new Set(occurrences.filter((row) => OPEN_STATES.has(row.state)).map((row) => row.billId))
  const extra = input.bills
    .filter((bill) => bill.status === 'active' && !withOpenRow.has(bill.id))
    .map((bill) => nextRowFor(bill, input))
    .filter((row): row is Occurrence => row !== null)

  const rows: BoardRow[] = [...occurrences, ...extra].flatMap((occurrence) => {
    const bill = billById.get(occurrence.billId)
    return bill ? [{ key: `${bill.id}:${occurrence.dueOn}:${occurrence.state}`, bill, occurrence }] : []
  })
  const groups = BOARD_GROUP_ORDER.map((id) => ({
    id,
    label: BOARD_GROUP_LABELS[id],
    rows: rows.filter((row) => groupOf(row.occurrence, input.today) === id),
  })).filter((group) => group.rows.length > 0)

  return {
    summary: stillToPay(occurrences, monthKeyOf(input.today)),
    groups,
    paused: input.bills.filter((bill) => bill.status === 'paused'),
    stopped: input.bills.filter((bill) => bill.status === 'ended'),
  }
}

// ─── Words ───────────────────────────────────────────────────────────────────

const MONTH_NAME = new Intl.DateTimeFormat('en-PH', { month: 'long', timeZone: 'UTC' })
const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'UTC' })
const MONTH_DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const atUtc = (day: string): Date => new Date(`${day}T00:00:00.000Z`)

/** "October" for a `YYYY-MM-DD` or `YYYY-MM`. */
export function monthNameOf(date: string): string {
  return MONTH_NAME.format(atUtc(`${date.slice(0, 7)}-01`))
}

/** "Nov 5". */
export function shortDate(day: string): string {
  return MONTH_DAY.format(atUtc(day))
}

/** "tomorrow", "Thu" (within the week), else "Nov 5". */
function whenWords(day: string, today: string): string {
  const ahead = daysBetween(today, day)
  if (ahead === 1) return 'tomorrow'
  if (ahead > 1 && ahead < THIS_WEEK_DAYS) return WEEKDAY_SHORT.format(atUtc(day))
  return shortDate(day)
}

/** "₱39,200 still to pay in October · 3 bills". */
export function summaryWords(summary: StillToPay, today: string): string {
  const month = monthNameOf(today)
  if (summary.count === 0) return `Nothing left to pay in ${month}`
  const bills = `${summary.count} ${summary.count === 1 ? 'bill' : 'bills'}`
  if (summary.cents === 0) return `${bills} still to pay in ${month}`
  const money = `${summary.hasEstimate ? 'about ' : ''}${formatPeso(summary.cents)}`
  return `${money} still to pay in ${month} · ${bills}`
}

export type DueTone = 'late' | 'soon' | 'calm' | 'done'

export interface DueWords {
  text: string
  tone: DueTone
}

const STATE_TONE: Readonly<Record<OccurrenceState, DueTone>> = {
  late: 'late',
  due_today: 'soon',
  due_soon: 'soon',
  upcoming: 'calm',
  snoozed: 'calm',
  paid: 'done',
  skipped: 'calm',
}

function dueText(occurrence: Occurrence, today: string): string {
  switch (occurrence.state) {
    case 'late':
      return occurrence.daysLate === 1 ? '1 day late' : `${occurrence.daysLate} days late`
    case 'due_today':
      return 'Due today'
    case 'due_soon':
    case 'upcoming':
      return `Due ${whenWords(occurrence.dueOn, today)}`
    case 'snoozed':
      return occurrence.snoozedUntil ? `Reminding you ${whenWords(occurrence.snoozedUntil, today)}` : 'Reminder set'
    case 'paid':
      return occurrence.payment ? `Paid ${shortDate(occurrence.payment.spentOn)}` : 'Paid'
    case 'skipped':
      return 'Nothing to pay'
  }
}

/** The due pill: words AND a tone, so colour is never the only signal. */
export function dueWords(occurrence: Occurrence, today: string): DueWords {
  return { text: dueText(occurrence, today), tone: STATE_TONE[occurrence.state] }
}

/** "₱15,000", "about ₱6,200", or "Amount changes" when nothing was paid yet. A collapsed late row: every payment it stands for. */
export function amountWords(occurrence: Occurrence): string {
  if (occurrence.amountCents === null) return 'Amount changes'
  const cents = occurrence.state === 'paid' ? occurrence.amountCents : occurrence.amountCents * paymentsOwed(occurrence)
  return `${occurrence.isEstimate ? 'about ' : ''}${formatPeso(cents)}`
}

/** "3 payments still open" for a collapsed late row, else null. */
export function lateCountWords(occurrence: Occurrence): string | null {
  return occurrence.lateCount > 1 ? `${occurrence.lateCount} payments still open` : null
}

/** "Rent · October": what a linked expense paid for. */
export function paidForWords(billName: string | null, billDueOn: string): string {
  return `${billName ?? 'A bill'} · ${monthNameOf(billDueOn)}`
}

// ─── Acting on a row ─────────────────────────────────────────────────────────

/** Paying, linking or skipping a collapsed late row settles its OLDEST open due date first. */
export function payDueOn(occurrence: Occurrence): string {
  return occurrence.lateDueOns[0] ?? occurrence.dueOn
}

/** Every due date "Remind me tomorrow" quiets (a collapsed late row: all of them). */
export function snoozeDueOns(occurrence: Occurrence): string[] {
  return occurrence.lateDueOns.length > 0 ? [...occurrence.lateDueOns] : [occurrence.dueOn]
}

/** Remind me tomorrow makes sense only for a bill due by tomorrow (or already late). */
export function canSnooze(occurrence: Occurrence, today: string): boolean {
  if (!OPEN_STATES.has(occurrence.state)) return false
  return occurrence.state === 'snoozed' || daysBetween(today, occurrence.dueOn) <= 1
}

export function isOpen(occurrence: Occurrence): boolean {
  return OPEN_STATES.has(occurrence.state)
}

/**
 * "I already recorded it": recorded expenses of the bill's category, spent
 * within ±10 days of the due date, not already paying a bill. Closest first.
 */
export function linkCandidates(expenses: readonly Expense[], bill: Pick<Bill, 'categoryId'>, dueOn: string): Expense[] {
  return expenses
    .filter(
      (expense) =>
        expense.status === 'recorded' &&
        expense.billId === null &&
        expense.categoryId === bill.categoryId &&
        Math.abs(daysBetween(dueOn, expense.spentOn)) <= LINK_WINDOW_DAYS,
    )
    .sort(
      (a, b) =>
        Math.abs(daysBetween(dueOn, a.spentOn)) - Math.abs(daysBetween(dueOn, b.spentOn)) ||
        b.spentOn.localeCompare(a.spentOn) ||
        b.createdAt.localeCompare(a.createdAt),
    )
}

export interface AmountChip {
  label: string
  cents: number
}

/** What Mark paid opens the Add expense dialog with. */
export interface BillPaymentPrefill {
  billId: string
  billDueOn: string
  /** "Pay Rent". */
  title: string
  description: string
  form: Partial<ExpenseFormState>
  /** "Usual" / "Last time" amounts for a bill that changes. */
  amountChips: AmountChip[]
}

/** "15,000": how the amount field shows money. */
export function amountText(cents: number): string {
  return formatPeso(cents).replace('₱', '')
}

function lastPayment(billId: string, payments: readonly BillPayment[]): BillPayment | null {
  return payments
    .filter((payment) => payment.billId === billId)
    .reduce<BillPayment | null>((newest, payment) => (newest === null || payment.dueOn > newest.dueOn ? payment : newest), null)
}

function amountChipsFor(bill: Bill, payments: readonly BillPayment[]): AmountChip[] {
  if (bill.amountCents !== null) return []
  const usual = estimateCents(bill, payments)
  const last = lastPayment(bill.id, payments)
  const chips: AmountChip[] = []
  if (usual !== null) chips.push({ label: 'Usual', cents: usual })
  if (last && last.amountCents !== usual) chips.push({ label: 'Last time', cents: last.amountCents })
  return chips
}

/**
 * Mark paid → the Add expense dialog, pre-filled and editable: the amount of a
 * fixed bill (a changing one offers Usual / Last time), category, paid from,
 * paid to, branch, note = the bill's name, spent today, and the bill + due date
 * this payment settles.
 */
export function paymentPrefill(bill: Bill, occurrence: Occurrence, payments: readonly BillPayment[], today: string): BillPaymentPrefill {
  const dueOn = payDueOn(occurrence)
  const due = daysBetween(dueOn, today) === 0 ? 'today' : shortDate(dueOn)
  return {
    billId: bill.id,
    billDueOn: dueOn,
    title: `Pay ${bill.name}`,
    description: `For the one due ${due}. It's saved as an expense, so Profit counts it.`,
    form: {
      amountText: bill.amountCents === null ? '' : amountText(bill.amountCents),
      categoryId: bill.categoryId,
      paidFrom: bill.paidFrom,
      outletId: bill.outletId,
      supplierId: bill.supplierId,
      paidToName: bill.supplierId ? '' : (bill.paidToName ?? ''),
      note: bill.name,
      spentOn: today,
    },
    amountChips: amountChipsFor(bill, payments),
  }
}

/** Tomorrow, Manila: what "Remind me tomorrow" snoozes until. */
export function tomorrowOf(today: string): string {
  return addDays(today, 1)
}
