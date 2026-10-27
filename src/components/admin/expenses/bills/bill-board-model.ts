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
  isBillPaused,
  monthKeyOf,
  nextDueDates,
  paymentsOwed,
  stillToPay,
  type Bill,
  type BillMark,
  type BillPayment,
  type BillRuleKind,
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
/**
 * The board reads payments ~120 days back, so an "about every N days" bill
 * whose last payment is older looks very late. Past this many days it reads
 * "Not marked in a while" instead of a day count that may not be true.
 */
export const LONG_LATE_DAYS = 60

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

const isPastSnooze = (occurrence: Occurrence, today: string): boolean => occurrence.state === 'snoozed' && occurrence.dueOn < today

/**
 * Past due dates snoozed together ("Remind me tomorrow" on a row of several
 * late months) fold back into ONE row per bill, like the late row they were:
 * the newest date, every date in `lateDueOns`, the earliest reminder. The
 * app's `bills-screen.ts` folds the same way.
 */
export function foldSnoozedLate(occurrences: readonly Occurrence[], today: string): Occurrence[] {
  const snoozedByBill = new Map<string, Occurrence[]>()
  for (const row of occurrences) {
    if (isPastSnooze(row, today)) snoozedByBill.set(row.billId, [...(snoozedByBill.get(row.billId) ?? []), row])
  }
  const folded = new Map<string, Occurrence>()
  for (const [billId, snoozed] of snoozedByBill) {
    if (snoozed.length < 2) continue
    const dueOns = [...new Set(snoozed.flatMap((row) => (row.lateDueOns.length > 0 ? row.lateDueOns : [row.dueOn])))].sort()
    const newest = snoozed.reduce((a, b) => (b.dueOn > a.dueOn ? b : a))
    const until = snoozed.map((row) => row.snoozedUntil).filter((day): day is string => day !== null).sort()[0] ?? null
    folded.set(billId, { ...newest, daysLate: daysBetween(newest.dueOn, today), lateCount: dueOns.length, lateDueOns: dueOns, snoozedUntil: until })
  }
  return occurrences.flatMap((row) => {
    const fold = isPastSnooze(row, today) ? folded.get(row.billId) : undefined
    if (!fold) return [row]
    // The fold takes the place of its newest date; the other snoozed dates are inside it.
    return row.dueOn === fold.dueOn ? [fold] : []
  })
}

export function buildBillBoard(input: BoardInput): BillBoardView {
  const context = { today: input.today, payments: input.payments, marks: input.marks }
  const pausedIds = new Set(input.bills.filter((bill) => isBillPaused(bill, input.today)).map((bill) => bill.id))
  // Still to pay is the engine's over ALL its occurrences (the app shows the same total). A bill
  // paused right now is listed under Paused only; what it was already paid this month still shows.
  const occurrences = billsDue(input.bills, context)
  const shown = foldSnoozedLate(
    occurrences.filter((row) => !(pausedIds.has(row.billId) && OPEN_STATES.has(row.state))),
    input.today,
  )
  const billById = new Map(input.bills.map((bill) => [bill.id, bill]))
  const withOpenRow = new Set(shown.filter((row) => OPEN_STATES.has(row.state)).map((row) => row.billId))
  const extra = input.bills
    .filter((bill) => bill.status !== 'ended' && !pausedIds.has(bill.id) && !withOpenRow.has(bill.id))
    .map((bill) => nextRowFor(bill, input))
    .filter((row): row is Occurrence => row !== null)

  const rows: BoardRow[] = [...shown, ...extra].flatMap((occurrence) => {
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
    paused: input.bills.filter((bill) => pausedIds.has(bill.id)),
    stopped: input.bills.filter((bill) => bill.status === 'ended'),
  }
}

/** How many rows the board's Late group holds: the "N late" on the Bills to pay tab. */
export function lateCountOf(board: Pick<BillBoardView, 'groups'>): number {
  return board.groups.find((group) => group.id === 'late')?.rows.length ?? 0
}

/** `lateCountOf(buildBillBoard(input))`, for the expense book's tab. */
export function lateBillCount(input: BoardInput): number {
  return lateCountOf(buildBillBoard(input))
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

function dueText(occurrence: Occurrence, today: string, ruleKind?: BillRuleKind): string {
  switch (occurrence.state) {
    case 'late':
      if (ruleKind === 'after_days' && occurrence.daysLate > LONG_LATE_DAYS) return 'Not marked in a while'
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

/** The due pill: words AND a tone, so colour is never the only signal. `ruleKind` words a long-late `after_days` bill. */
export function dueWords(occurrence: Occurrence, today: string, ruleKind?: BillRuleKind): DueWords {
  return { text: dueText(occurrence, today, ruleKind), tone: STATE_TONE[occurrence.state] }
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
 * within ±10 days of the due date, not already paying a bill — and for a
 * branch's bill, recorded at that branch (the database refuses any other).
 * Closest first.
 */
export function linkCandidates(expenses: readonly Expense[], bill: Pick<Bill, 'categoryId' | 'outletId'>, dueOn: string): Expense[] {
  return expenses
    .filter(
      (expense) =>
        expense.status === 'recorded' &&
        expense.billId === null &&
        expense.categoryId === bill.categoryId &&
        (bill.outletId === null || expense.outletId === bill.outletId) &&
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
  /** A branch's bill is paid from that branch only: the dialog locks its branch to this. Null = store-wide (the form decides). */
  branchOutletId: string | null
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
 * paid to, note = the bill's name, spent today, and the bill + due date this
 * payment settles. A branch's bill is filed on (and locked to) that branch; a
 * store-wide bill leaves the branch to the form.
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
      ...(bill.outletId === null ? {} : { outletId: bill.outletId }),
      supplierId: bill.supplierId,
      paidToName: bill.supplierId ? '' : (bill.paidToName ?? ''),
      note: bill.name,
      spentOn: today,
    },
    amountChips: amountChipsFor(bill, payments),
    branchOutletId: bill.outletId,
  }
}

/** Tomorrow, Manila: what "Remind me tomorrow" snoozes until. */
export function tomorrowOf(today: string): string {
  return addDays(today, 1)
}
