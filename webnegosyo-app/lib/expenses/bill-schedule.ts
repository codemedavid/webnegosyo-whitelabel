/**
 * Bills to pay — the schedule engine (contract: docs/plans/expenses/bills-contract.md §3).
 *
 * A bill is a REMINDER, never money: due dates are computed here from the
 * bill's repeat rule and never stored. Paying = one ordinary expense carrying
 * `bill_id` + `bill_due_on` (a `BillPayment` below); "Nothing to pay this
 * time" and "Remind me tomorrow" are `BillMark`s.
 *
 * - Dates are Asia/Manila business dates `YYYY-MM-DD` (`manila-date.ts`).
 * - Money is integer centavos; estimates are rounded to a whole peso.
 * - Days 29–31 and 'last' fall on the month's real last day (Feb 28/29).
 *
 * Phone reminders live in `bill-reminders.ts`, "Make it a bill?" in
 * `bill-suggestions.ts`; both build on this file.
 *
 * Imports only `./manila-date` and `./types`. Copied byte-for-byte into the
 * merchant app (`tests/unit/expenses/app-parity.test.ts`).
 */
import { addDays, daysBetween } from './manila-date'
import type { PaidFrom } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

/** 1..31, or the month's last day. */
export type DayOfMonth = number | 'last'

export type BillRule =
  | { kind: 'monthly'; day: DayOfMonth }
  | { kind: 'twice_monthly'; days: [DayOfMonth, DayOfMonth] }
  | { kind: 'weekly'; every: 1 | 2; weekday: number }
  | { kind: 'months'; every: 2 | 3 | 4 | 6 | 12; day: DayOfMonth }
  | { kind: 'after_days'; every: number }

export type BillRuleKind = BillRule['kind']
export type BillStatus = 'active' | 'paused' | 'ended'
export type BillPaidFrom = Exclude<PaidFrom, 'drawer'>

/** Where a bill's money may come from in v1 (never the drawer). */
export const BILL_PAID_FROM: readonly BillPaidFrom[] = Object.freeze(['cash', 'gcash', 'maya', 'bank', 'card', 'owner'])

export interface Bill {
  id: string
  tenantId: string
  outletId: string | null
  name: string
  categoryId: string
  supplierId: string | null
  paidToName: string | null
  paidFrom: BillPaidFrom
  /** NULL = changes every time (an estimate is used instead). */
  amountCents: number | null
  rule: BillRule
  startsOn: string
  endsOn: string | null
  remindDaysBefore: number
  status: BillStatus
  /** Only while paused; NULL = until resumed. */
  pausedUntil: string | null
  /**
   * The day the pause began (only while paused; set by the database). With
   * `pausedUntil` it is the window whose due dates are never owed. NULL on a
   * pause saved before 2026-10-22: everything before `pausedUntil` is skipped.
   */
  pausedOn: string | null
  createdAt: string
}

/** The part of a bill that decides its due dates (a draft has no id yet). */
export type BillSchedule = Pick<Bill, 'rule' | 'startsOn' | 'endsOn'>

/** A recorded expense linked to a bill. */
export interface BillPayment {
  billId: string
  dueOn: string
  expenseId: string
  amountCents: number
  spentOn: string
}

export type BillMarkKind = 'skipped' | 'snoozed'

export interface BillMark {
  billId: string
  dueOn: string
  kind: BillMarkKind
  snoozedUntil: string | null
}

export type OccurrenceState = 'paid' | 'skipped' | 'snoozed' | 'late' | 'due_today' | 'due_soon' | 'upcoming'

export interface Occurrence {
  billId: string
  /** For a collapsed late row: the NEWEST late due date. */
  dueOn: string
  state: OccurrenceState
  /** Paid: what was paid. Otherwise the bill amount or its estimate (null = unknown). */
  amountCents: number | null
  isEstimate: boolean
  payment: BillPayment | null
  /** Days since `dueOn` when late, else 0. */
  daysLate: number
  /** How many late due dates this row stands for (0 when not late). */
  lateCount: number
  /** Every late due date this row stands for, oldest first ([] when not late). */
  lateDueOns: string[]
  /** Set while snoozed. */
  snoozedUntil: string | null
}

export interface BillContext {
  /** Manila business date. */
  today: string
  payments: readonly BillPayment[]
  marks: readonly BillMark[]
  /** How far ahead to list due dates (default 31). */
  horizonDays?: number
}

// ─── Limits ──────────────────────────────────────────────────────────────────

/** How far back an unpaid due date is still listed as late. */
export const LATE_LOOKBACK_DAYS = 92
export const DEFAULT_HORIZON_DAYS = 31
/** "Due soon" = due within this many days. */
export const DUE_SOON_DAYS = 3
export const BILL_NAME_MAX = 60
export const BILL_PAID_TO_MAX = 80
export const BILL_AMOUNT_MAX_CENTS = 1_000_000_000
export const BILL_REMIND_MAX_DAYS = 14
export const BILL_AFTER_DAYS_MAX = 90
/** A bill may start at most this many days ago. */
export const BILL_START_MAX_AGE_DAYS = 400
export const MONTHS_EVERY: readonly number[] = Object.freeze([2, 3, 4, 6, 12])

const PESO_CENTS = 100
const ESTIMATE_PAYMENTS = 3
const LAST_DAY_COLUMN = 0
const SHORTEST_MONTH_DAYS = 28
/** Any leap year: a yearly bill on 29 Feb reads as "29 Feb". */
const A_LEAP_YEAR = 2024
const WEEK_DAYS = 7

/** Far enough ahead to find the next due date of any rule (the longest gap is a year). */
const NEXT_DUE_SEARCH_DAYS = 400
const LAST_DATE = '9999-12-31'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Date helpers ────────────────────────────────────────────────────────────

const pad2 = (value: number): string => String(value).padStart(2, '0')
const laterOf = (a: string, b: string): string => (a > b ? a : b)
const earlierOf = (a: string, b: string): string => (a < b ? a : b)

/** `{year, month (1..12), day}`; throws on anything that isn't a real date. */
function partsOf(date: string): { year: number; month: number; day: number } {
  addDays(date, 0)
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Months since year 0: one integer per calendar month. */
function monthIndexOf(date: string): number {
  const { year, month } = partsOf(date)
  return year * 12 + month - 1
}

/** The real date `day` lands on in a month: 29–31 and 'last' clamp to its last day. */
function dateIn(monthIndex: number, day: DayOfMonth): string {
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  const lastDay = daysInMonth(year, month)
  const actual = day === 'last' ? lastDay : Math.min(day, lastDay)
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(actual)}`
}

function weekdayOf(date: string): number {
  partsOf(date)
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

/** `YYYY-MM` of a date. */
export const monthKeyOf = (date: string): string => date.slice(0, 7)

// ─── Rule shape ──────────────────────────────────────────────────────────────

function isDayOfMonth(value: unknown): value is DayOfMonth {
  return value === 'last' || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31)
}

function isWeekday(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6
}

/** What is wrong with a rule's shape, in the owner's words; null = fine. */
function ruleProblem(rule: BillRule): string | null {
  switch (rule?.kind) {
    case 'monthly':
      return isDayOfMonth(rule.day) ? null : 'Pick a day of the month'
    case 'twice_monthly': {
      const days = rule.days
      const isPair = Array.isArray(days) && days.length === 2 && days.every(isDayOfMonth)
      return isPair && days[0] !== days[1] ? null : 'Pick two different days of the month'
    }
    case 'weekly':
      if (rule.every !== 1 && rule.every !== 2) return 'Repeat every week or every 2 weeks'
      return isWeekday(rule.weekday) ? null : 'Pick a day of the week'
    case 'months':
      if (!MONTHS_EVERY.includes(rule.every)) return 'Repeat every 2, 3, 4, 6 or 12 months'
      return isDayOfMonth(rule.day) ? null : 'Pick a day of the month'
    case 'after_days': {
      const every = rule.every
      const isValid = Number.isInteger(every) && every >= 1 && every <= BILL_AFTER_DAYS_MAX
      return isValid ? null : `Pick from 1 to ${BILL_AFTER_DAYS_MAX} days`
    }
    default:
      return 'Pick how often it repeats'
  }
}

/** The database columns of a rule (contract §2). */
export interface BillRuleColumns {
  repeat_kind: BillRuleKind
  repeat_every: number
  /** 1..31, 0 = the month's last day. */
  repeat_days: number[] | null
  /** 0 Sunday .. 6 Saturday. */
  repeat_weekday: number | null
}

/** Loosely typed row as read from the database. */
export interface BillRuleRow {
  repeat_kind: string
  repeat_every: number
  repeat_days: readonly number[] | null
  repeat_weekday: number | null
}

const dayColumn = (day: DayOfMonth): number => (day === 'last' ? LAST_DAY_COLUMN : day)

function dayFromColumn(value: number): DayOfMonth {
  if (value === LAST_DAY_COLUMN) return 'last'
  if (isDayOfMonth(value)) return value
  throw new Error(`Impossible bill rule: day ${value}`)
}

export function ruleToColumns(rule: BillRule): BillRuleColumns {
  const problem = ruleProblem(rule)
  if (problem) throw new Error(`Impossible bill rule: ${problem}`)
  switch (rule.kind) {
    case 'monthly':
      return { repeat_kind: 'monthly', repeat_every: 1, repeat_days: [dayColumn(rule.day)], repeat_weekday: null }
    case 'twice_monthly':
      return { repeat_kind: 'twice_monthly', repeat_every: 1, repeat_days: rule.days.map(dayColumn), repeat_weekday: null }
    case 'weekly':
      return { repeat_kind: 'weekly', repeat_every: rule.every, repeat_days: null, repeat_weekday: rule.weekday }
    case 'months':
      return { repeat_kind: 'months', repeat_every: rule.every, repeat_days: [dayColumn(rule.day)], repeat_weekday: null }
    case 'after_days':
      return { repeat_kind: 'after_days', repeat_every: rule.every, repeat_days: null, repeat_weekday: null }
  }
}

function expectShape(isValid: boolean, row: BillRuleRow): void {
  if (!isValid) throw new Error(`Impossible bill rule: ${JSON.stringify(row)}`)
}

function ruleFromRow(row: BillRuleRow): BillRule {
  const days = row.repeat_days
  const hasNoWeekday = row.repeat_weekday === null
  switch (row.repeat_kind) {
    case 'monthly':
      expectShape(row.repeat_every === 1 && days?.length === 1 && hasNoWeekday, row)
      return { kind: 'monthly', day: dayFromColumn(days![0]) }
    case 'twice_monthly':
      expectShape(row.repeat_every === 1 && days?.length === 2 && hasNoWeekday, row)
      return { kind: 'twice_monthly', days: [dayFromColumn(days![0]), dayFromColumn(days![1])] }
    case 'weekly':
      expectShape(days === null, row)
      return { kind: 'weekly', every: row.repeat_every as 1 | 2, weekday: row.repeat_weekday as number }
    case 'months':
      expectShape(days?.length === 1 && hasNoWeekday, row)
      return { kind: 'months', every: row.repeat_every as 2 | 3 | 4 | 6 | 12, day: dayFromColumn(days![0]) }
    case 'after_days':
      expectShape(days === null && hasNoWeekday, row)
      return { kind: 'after_days', every: row.repeat_every }
    default:
      throw new Error(`Impossible bill rule: kind "${row.repeat_kind}"`)
  }
}

/** Database row → rule. Throws on a row the shape CHECK should never have let in. */
export function ruleFromColumns(row: BillRuleRow): BillRule {
  const rule = ruleFromRow(row)
  const problem = ruleProblem(rule)
  if (problem) throw new Error(`Impossible bill rule: ${problem}`)
  return rule
}

// ─── Due dates ───────────────────────────────────────────────────────────────

function monthDayDates(days: readonly DayOfMonth[], lo: string, hi: string, anchorMonth: number, step: number): string[] {
  const dates = new Set<string>()
  for (let index = monthIndexOf(lo); index <= monthIndexOf(hi); index += 1) {
    if ((index - anchorMonth) % step !== 0) continue
    for (const day of days) {
      const date = dateIn(index, day)
      if (date >= lo && date <= hi) dates.add(date)
    }
  }
  return [...dates].sort()
}

function weeklyDates(weekday: number, every: number, startsOn: string, lo: string, hi: string): string[] {
  const first = addDays(startsOn, (weekday - weekdayOf(startsOn) + WEEK_DAYS) % WEEK_DAYS)
  const step = WEEK_DAYS * every
  const skipped = first >= lo ? 0 : Math.ceil(daysBetween(first, lo) / step)
  const dates: string[] = []
  for (let date = addDays(first, skipped * step); date <= hi; date = addDays(date, step)) dates.push(date)
  return dates
}

/**
 * Every due date in [from, to], on/after `startsOn` and on/before `endsOn`,
 * oldest first. `after_days` has ONE: anchor + every once settled (never before
 * `startsOn`), else `startsOn`. The anchor is the later of the last settled due
 * date and the day it was paid (`afterDaysAnchor`).
 */
export function dueDatesBetween(bill: BillSchedule, from: string, to: string, lastPaidDueOn?: string | null): string[] {
  const lo = laterOf(from, bill.startsOn)
  const hi = bill.endsOn === null ? to : earlierOf(to, bill.endsOn)
  partsOf(lo)
  partsOf(hi)
  if (lo > hi) return []
  const rule = bill.rule
  switch (rule.kind) {
    case 'monthly':
      return monthDayDates([rule.day], lo, hi, 0, 1)
    case 'twice_monthly':
      return monthDayDates(rule.days, lo, hi, 0, 1)
    case 'months':
      return monthDayDates([rule.day], lo, hi, monthIndexOf(bill.startsOn), rule.every)
    case 'weekly':
      return weeklyDates(rule.weekday, rule.every, bill.startsOn, lo, hi)
    case 'after_days': {
      const due = lastPaidDueOn ? laterOf(addDays(lastPaidDueOn, rule.every), bill.startsOn) : bill.startsOn
      return due >= lo && due <= hi ? [due] : []
    }
  }
}

// ─── Estimates ───────────────────────────────────────────────────────────────

function newestFirst(a: BillPayment, b: BillPayment): number {
  if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? 1 : -1
  return a.spentOn < b.spentOn ? 1 : a.spentOn > b.spentOn ? -1 : 0
}

/** Rounded to a whole peso, never below ₱1. */
export const roundToPeso = (cents: number): number => Math.max(PESO_CENTS, Math.round(cents / PESO_CENTS) * PESO_CENTS)

/** The bill's amount, else the rounded-to-peso average of its last 3 payments, else null. */
export function estimateCents(bill: Pick<Bill, 'id' | 'amountCents'>, payments: readonly BillPayment[]): number | null {
  if (bill.amountCents !== null) return bill.amountCents
  const recent = payments.filter((payment) => payment.billId === bill.id).sort(newestFirst).slice(0, ESTIMATE_PAYMENTS)
  if (recent.length === 0) return null
  const total = recent.reduce((sum, payment) => sum + payment.amountCents, 0)
  return roundToPeso(total / recent.length)
}

// ─── Occurrences ─────────────────────────────────────────────────────────────

const latestOf = (dates: readonly string[]): string | null =>
  dates.reduce<string | null>((latest, date) => (latest === null || date > latest ? date : latest), null)

/**
 * Where "about every N days after the last one" counts from: the later of the
 * last settled due date and the day it was paid (a refill bought a week late
 * is due N days after the purchase). A skip counts from its due date.
 */
export function afterDaysAnchor(billId: string, payments: readonly BillPayment[], marks: readonly BillMark[]): string | null {
  return latestOf([
    ...payments.filter((payment) => payment.billId === billId).map((payment) => laterOf(payment.dueOn, payment.spentOn)),
    ...marks.filter((mark) => mark.billId === billId && mark.kind === 'skipped').map((mark) => mark.dueOn),
  ])
}

/** The latest due date already paid or skipped ("Nothing to pay this time"); snoozes don't count. */
export function lastSettledDueOn(billId: string, payments: readonly BillPayment[], marks: readonly BillMark[]): string | null {
  return latestOf([
    ...payments.filter((payment) => payment.billId === billId).map((payment) => payment.dueOn),
    ...marks.filter((mark) => mark.billId === billId && mark.kind === 'skipped').map((mark) => mark.dueOn),
  ])
}

interface BillLedger {
  paymentByDue: Map<string, BillPayment>
  markByDue: Map<string, BillMark>
  /** The `after_days` anchor (`afterDaysAnchor`). */
  anchor: string | null
}

function ledgerOf(billId: string, ctx: BillContext): BillLedger {
  const paymentByDue = new Map<string, BillPayment>()
  const markByDue = new Map<string, BillMark>()
  for (const payment of ctx.payments) {
    if (payment.billId !== billId || paymentByDue.has(payment.dueOn)) continue
    paymentByDue.set(payment.dueOn, payment)
  }
  for (const mark of ctx.marks) {
    if (mark.billId === billId) markByDue.set(mark.dueOn, mark)
  }
  return { paymentByDue, markByDue, anchor: afterDaysAnchor(billId, ctx.payments, ctx.marks) }
}

function blankOccurrence(billId: string, dueOn: string, state: OccurrenceState): Occurrence {
  return {
    billId,
    dueOn,
    state,
    amountCents: null,
    isEstimate: false,
    payment: null,
    daysLate: 0,
    lateCount: 0,
    lateDueOns: [],
    snoozedUntil: null,
  }
}

function openState(dueOn: string, today: string, mark: BillMark | undefined): OccurrenceState {
  if (mark?.kind === 'snoozed' && mark.snoozedUntil !== null && mark.snoozedUntil > today) return 'snoozed'
  if (dueOn < today) return 'late'
  if (dueOn === today) return 'due_today'
  return daysBetween(today, dueOn) <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming'
}

/** Paused right now: until resumed by hand, or until a date still ahead. A pause whose date has come acts as active. */
export function isBillPaused(bill: Pick<Bill, 'status' | 'pausedUntil'>, today: string): boolean {
  return bill.status === 'paused' && (bill.pausedUntil === null || bill.pausedUntil > today)
}

/**
 * A due date a timed pause swallowed: in [pausedOn, pausedUntil). It is never
 * owed, not even after the pause ends. A pause without `pausedOn` (saved
 * before it was recorded) swallows everything before `pausedUntil`.
 */
function isInPause(bill: Bill, dueOn: string): boolean {
  if (bill.status !== 'paused' || bill.pausedUntil === null) return false
  return dueOn < bill.pausedUntil && (bill.pausedOn === null || dueOn >= bill.pausedOn)
}

/**
 * The single `after_days` date. Never dropped for being old (it is the only
 * one); a refill that fell inside a pause comes due the day the pause ends.
 */
function afterDaysOpen(bill: Bill, ctx: BillContext, anchor: string | null, to: string): string[] {
  const [due] = dueDatesBetween(bill, bill.startsOn, LAST_DATE, anchor)
  if (due === undefined) return []
  const isHeld = (isBillPaused(bill, ctx.today) || isInPause(bill, due)) && bill.pausedUntil !== null
  const shifted = isHeld ? laterOf(due, bill.pausedUntil as string) : due
  if (shifted > to || (bill.endsOn !== null && shifted > bill.endsOn)) return []
  return [shifted]
}

/** Unpaid, unskipped due dates still worth showing; none for an ended or open-ended paused bill. */
function openDueDates(bill: Bill, ctx: BillContext, ledger: BillLedger): string[] {
  if (bill.status === 'ended') return []
  if (bill.status === 'paused' && bill.pausedUntil === null) return []
  const lookback = addDays(ctx.today, -LATE_LOOKBACK_DAYS)
  // While a timed pause runs nothing before its end date shows (not even older late ones).
  const from = isBillPaused(bill, ctx.today) ? laterOf(lookback, bill.pausedUntil as string) : lookback
  const to = addDays(ctx.today, ctx.horizonDays ?? DEFAULT_HORIZON_DAYS)
  const dates = bill.rule.kind === 'after_days' ? afterDaysOpen(bill, ctx, ledger.anchor, to) : dueDatesBetween(bill, from, to)
  return dates.filter(
    (dueOn) => !isInPause(bill, dueOn) && !ledger.paymentByDue.has(dueOn) && ledger.markByDue.get(dueOn)?.kind !== 'skipped',
  )
}

function settledThisMonth(bill: Bill, ledger: BillLedger, monthKey: string): Occurrence[] {
  const paid = [...ledger.paymentByDue.values()]
    .filter((payment) => monthKeyOf(payment.dueOn) === monthKey)
    .map((payment) => ({ ...blankOccurrence(bill.id, payment.dueOn, 'paid'), amountCents: payment.amountCents, payment }))
  if (bill.status === 'ended') return paid
  const skipped = [...ledger.markByDue.values()]
    .filter((mark) => mark.kind === 'skipped' && monthKeyOf(mark.dueOn) === monthKey && !ledger.paymentByDue.has(mark.dueOn))
    .map((mark) => blankOccurrence(bill.id, mark.dueOn, 'skipped'))
  return [...paid, ...skipped]
}

function collapseLate(rows: readonly Occurrence[], today: string): Occurrence[] {
  const late = rows.filter((row) => row.state === 'late')
  if (late.length === 0) return [...rows]
  const newest = late[late.length - 1]
  const collapsed: Occurrence = {
    ...newest,
    daysLate: daysBetween(newest.dueOn, today),
    lateCount: late.length,
    lateDueOns: late.map((row) => row.dueOn),
  }
  return [collapsed, ...rows.filter((row) => row.state !== 'late')]
}

/**
 * The bill's open and recent occurrences, oldest first: every unpaid, unskipped
 * due date from max(startsOn, today − 92 days) to today + horizonDays, plus this
 * calendar month's paid / skipped ones. Several late ones collapse into the
 * newest (`lateCount`, `lateDueOns`).
 */
export function occurrencesFor(bill: Bill, ctx: BillContext): Occurrence[] {
  const ledger = ledgerOf(bill.id, ctx)
  const estimate = estimateCents(bill, ctx.payments)
  const isEstimate = bill.amountCents === null && estimate !== null
  const open = openDueDates(bill, ctx, ledger).map((dueOn): Occurrence => {
    const mark = ledger.markByDue.get(dueOn)
    const state = openState(dueOn, ctx.today, mark)
    return {
      ...blankOccurrence(bill.id, dueOn, state),
      amountCents: estimate,
      isEstimate,
      snoozedUntil: state === 'snoozed' ? (mark?.snoozedUntil ?? null) : null,
    }
  })
  const settled = settledThisMonth(bill, ledger, monthKeyOf(ctx.today)).map((row) =>
    row.state === 'skipped' ? { ...row, amountCents: estimate, isEstimate } : row,
  )
  const rows = [...collapseLate(open, ctx.today), ...settled]
  return rows.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
}

const STATE_RANK: Readonly<Record<OccurrenceState, number>> = Object.freeze({
  late: 0,
  due_today: 1,
  due_soon: 2,
  upcoming: 3,
  snoozed: 4,
  paid: 5,
  skipped: 6,
})

/** Every bill's occurrences, late → due today → due soon → upcoming (then snoozed, paid, skipped), then date, then name. */
export function billsDue(bills: readonly Bill[], ctx: BillContext): Occurrence[] {
  const nameOf = new Map(bills.map((bill) => [bill.id, bill.name]))
  const rows = bills.flatMap((bill) => occurrencesFor(bill, ctx))
  return rows.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0) ||
      (nameOf.get(a.billId) ?? '').localeCompare(nameOf.get(b.billId) ?? '', undefined, { sensitivity: 'base' }) ||
      (a.billId < b.billId ? -1 : a.billId > b.billId ? 1 : 0),
  )
}

/** Unpaid and unskipped: still to pay, and worth a reminder. */
export const OPEN_STATES: ReadonlySet<OccurrenceState> = new Set(['late', 'due_today', 'due_soon', 'upcoming', 'snoozed'])

/** How many payments a row stands for (a collapsed late row: all of them). */
export const paymentsOwed = (occurrence: Occurrence): number => Math.max(1, occurrence.lateCount)

export interface StillToPay {
  cents: number
  /** Payments still to make (a collapsed late row counts each late date). */
  count: number
  /** Some of `cents` is an estimate, or a row has no amount at all. */
  hasEstimate: boolean
}

/** Late rows + this month's unpaid, unskipped ones. Paused / ended bills list none, so add nothing. */
export function stillToPay(occurrences: readonly Occurrence[], monthKey: string): StillToPay {
  const rows = occurrences.filter(
    (row) => OPEN_STATES.has(row.state) && (row.state === 'late' || monthKeyOf(row.dueOn) <= monthKey),
  )
  return {
    cents: rows.reduce((sum, row) => sum + (row.amountCents ?? 0) * paymentsOwed(row), 0),
    count: rows.reduce((sum, row) => sum + paymentsOwed(row), 0),
    hasEstimate: rows.some((row) => row.isEstimate || row.amountCents === null),
  }
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, 31st. */
export function ordinal(value: number): string {
  const lastTwo = value % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th'
  return `${value}${suffix}`
}

const dayWords = (day: DayOfMonth): string => (day === 'last' ? 'last day' : ordinal(day))
const daySortKey = (day: DayOfMonth): number => (day === 'last' ? 32 : day)

function yearlySentence(day: DayOfMonth, startsOn: string): string {
  const { month } = partsOf(startsOn)
  const monthName = MONTH_NAMES[month - 1]
  if (day === 'last') return `Every year on the last day of ${monthName}`
  const longestInMonth = daysInMonth(A_LEAP_YEAR, month)
  return `Every year on ${Math.min(day, longestInMonth)} ${monthName}`
}

/** "Every month on the 5th", "Twice a month: 15th and last day", "Every 2 weeks on Tuesday"… */
export function ruleSentence(rule: BillRule, startsOn: string): string {
  switch (rule.kind) {
    case 'monthly':
      return `Every month on the ${dayWords(rule.day)}`
    case 'twice_monthly': {
      const [first, second] = [...rule.days].sort((a, b) => daySortKey(a) - daySortKey(b))
      return `Twice a month: ${dayWords(first)} and ${dayWords(second)}`
    }
    case 'weekly':
      return rule.every === 1
        ? `Every week on ${DAY_NAMES[rule.weekday]}`
        : `Every ${rule.every} weeks on ${DAY_NAMES[rule.weekday]}`
    case 'months':
      return rule.every === 12 ? yearlySentence(rule.day, startsOn) : `Every ${rule.every} months on the ${dayWords(rule.day)}`
    case 'after_days':
      return rule.every === 1 ? 'About every day after the last one' : `About every ${rule.every} days after the last one`
  }
}

// ─── Editor preview ──────────────────────────────────────────────────────────

const PREVIEW_SPAN_DAYS_PER_DATE = 366
const PREVIEW_SLACK_DAYS = 62

/**
 * The next `n` due dates for the editor preview: calendar rules from today on
 * (dates already paid are skipped); `after_days` from its next due date (which
 * may be late), then every N days. Status is ignored — this previews the rule.
 */
export function nextDueDates(
  bill: BillSchedule & { id?: string },
  today: string,
  n: number = 3,
  payments: readonly BillPayment[] = [],
): string[] {
  const own = bill.id === undefined ? payments : payments.filter((payment) => payment.billId === bill.id)
  const paid = new Set(own.map((payment) => payment.dueOn))
  if (bill.rule.kind === 'after_days') {
    const anchor = latestOf(own.map((payment) => laterOf(payment.dueOn, payment.spentOn)))
    const [first] = dueDatesBetween(bill, bill.startsOn, LAST_DATE, anchor)
    if (first === undefined) return []
    const every = bill.rule.every
    const dates = Array.from({ length: Math.max(0, n) }, (_, index) => addDays(first, index * every))
    return dates.filter((date) => bill.endsOn === null || date <= bill.endsOn)
  }
  const paidAhead = [...paid].filter((dueOn) => dueOn >= today).length
  const to = addDays(today, PREVIEW_SPAN_DAYS_PER_DATE * (n + paidAhead) + PREVIEW_SLACK_DAYS)
  return dueDatesBetween(bill, today, to)
    .filter((date) => !paid.has(date))
    .slice(0, Math.max(0, n))
}

// ─── Editing / resuming without rewriting the past ───────────────────────────

/**
 * The start date to save when a bill's rule or start date is edited, or when
 * it is resumed, so the change applies from the next due date only: the first
 * due date of `bill` (the NEW rule, counted from its own `startsOn`) on or
 * after the latest of its `startsOn`, `today` and the day after its last paid
 * or skipped due date. Snapping to a real due date keeps the rhythm of
 * "every 2 weeks" and "every N months" (and a yearly bill's month). Past due
 * dates are never re-computed with the new rule, so nothing turns late.
 * `after_days` restarts on that day itself. Null = no due date is left before
 * the end date (the owner moves the end date or stops the bill): any other
 * start would either re-open the past or shift the rhythm.
 */
export function restartOnFor(
  bill: BillSchedule & { id: string },
  payments: readonly BillPayment[],
  marks: readonly BillMark[],
  today: string,
): string | null {
  const settled = lastSettledDueOn(bill.id, payments, marks)
  const earliest = laterOf(laterOf(bill.startsOn, today), settled === null ? bill.startsOn : addDays(settled, 1))
  if (bill.endsOn !== null && earliest > bill.endsOn) return null
  if (bill.rule.kind === 'after_days') return earliest
  const [first] = dueDatesBetween(bill, earliest, bill.endsOn ?? addDays(earliest, NEXT_DUE_SEARCH_DAYS))
  return first ?? null
}

// ─── Draft validation ────────────────────────────────────────────────────────

export interface BillDraft {
  name: string
  categoryId: string
  /** NULL = changes every time. */
  amountCents: number | null
  rule: BillRule
  startsOn: string
  endsOn: string | null
  remindDaysBefore: number
  paidFrom: string
  paidToName?: string | null
}

export type BillDraftField =
  | 'name'
  | 'categoryId'
  | 'amountCents'
  | 'rule'
  | 'startsOn'
  | 'endsOn'
  | 'remindDaysBefore'
  | 'paidFrom'
  | 'paidToName'

export type BillDraftCheck = { ok: true } | { ok: false; field: BillDraftField; message: string }

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    partsOf(value)
    return true
  } catch {
    return false
  }
}

type Problem = { field: BillDraftField; message: string } | null

function textProblem(draft: BillDraft): Problem {
  const name = typeof draft.name === 'string' ? draft.name.trim() : ''
  if (name === '') return { field: 'name', message: 'Give the bill a name' }
  if (name.length > BILL_NAME_MAX) return { field: 'name', message: `Keep the name to ${BILL_NAME_MAX} letters or fewer` }
  if (typeof draft.categoryId !== 'string' || draft.categoryId === '') return { field: 'categoryId', message: 'Pick a category' }
  const paidTo = draft.paidToName?.trim() ?? ''
  if (paidTo.length > BILL_PAID_TO_MAX) {
    return { field: 'paidToName', message: `Keep who it's paid to to ${BILL_PAID_TO_MAX} letters or fewer` }
  }
  return null
}

function moneyProblem(draft: BillDraft): Problem {
  const amount = draft.amountCents
  const isAmount = amount === null || (Number.isInteger(amount) && amount >= 1 && amount <= BILL_AMOUNT_MAX_CENTS)
  if (!isAmount) return { field: 'amountCents', message: 'Enter an amount from ₱0.01 to ₱10,000,000' }
  if (draft.paidFrom === 'drawer') return { field: 'paidFrom', message: "Bills can't be paid from the drawer yet" }
  if (!BILL_PAID_FROM.includes(draft.paidFrom as BillPaidFrom)) {
    return { field: 'paidFrom', message: 'Pick where the money comes from' }
  }
  return null
}

/** Two days that always fall on different dates, even in a 28-day February. */
function twiceMonthlyCollides(rule: BillRule): boolean {
  if (rule.kind !== 'twice_monthly') return false
  const [a, b] = rule.days.map((day) => (day === 'last' ? SHORTEST_MONTH_DAYS : Math.min(day, SHORTEST_MONTH_DAYS)))
  return a === b
}

function scheduleProblem(draft: BillDraft, today: string, savedStartsOn: string | null): Problem {
  const ruleMessage = ruleProblem(draft.rule)
  if (ruleMessage) return { field: 'rule', message: ruleMessage }
  if (twiceMonthlyCollides(draft.rule)) {
    return { field: 'rule', message: 'Pick two days that never fall on the same date' }
  }
  if (!isRealDate(draft.startsOn)) return { field: 'startsOn', message: 'Pick a start date' }
  // Only a NEW start date is bounded: a bill running for years keeps its own.
  if (draft.startsOn !== savedStartsOn && daysBetween(draft.startsOn, today) > BILL_START_MAX_AGE_DAYS) {
    return { field: 'startsOn', message: `Pick a start date within the last ${BILL_START_MAX_AGE_DAYS} days` }
  }
  if (draft.endsOn !== null && !isRealDate(draft.endsOn)) return { field: 'endsOn', message: 'Pick an end date' }
  if (draft.endsOn !== null && draft.endsOn < draft.startsOn) {
    return { field: 'endsOn', message: "The end date can't be before the start date" }
  }
  const remind = draft.remindDaysBefore
  if (!Number.isInteger(remind) || remind < 0 || remind > BILL_REMIND_MAX_DAYS) {
    return { field: 'remindDaysBefore', message: `Remind 0 to ${BILL_REMIND_MAX_DAYS} days before` }
  }
  return null
}

/**
 * A bill draft's first problem, in the owner's words. `today` (Manila) bounds
 * a new start date: no more than 400 days ago. When editing, pass the saved
 * bill's `startsOn` so an old bill can still be changed.
 */
export function validateBillDraft(
  draft: BillDraft,
  today: string,
  options: { savedStartsOn?: string | null } = {},
): BillDraftCheck {
  const problem =
    textProblem(draft) ?? moneyProblem(draft) ?? scheduleProblem(draft, today, options.savedStartsOn ?? null)
  return problem ? { ok: false, ...problem } : { ok: true }
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export interface BillPreset {
  readonly key: string
  readonly name: string
  /** The seeded category to pick (`SEED_CATEGORIES`). */
  readonly systemKey: string
  readonly rule: BillRule
  readonly amountMode: 'fixed' | 'varies'
  readonly remindDaysBefore: number
}

export const BILL_PRESETS: readonly BillPreset[] = Object.freeze([
  { key: 'rent', name: 'Rent', systemKey: 'rent', rule: { kind: 'monthly', day: 1 }, amountMode: 'fixed', remindDaysBefore: 3 },
  { key: 'kuryente', name: 'Kuryente', systemKey: 'electricity', rule: { kind: 'monthly', day: 15 }, amountMode: 'varies', remindDaysBefore: 1 },
  { key: 'tubig', name: 'Tubig', systemKey: 'water', rule: { kind: 'monthly', day: 15 }, amountMode: 'varies', remindDaysBefore: 1 },
  { key: 'internet', name: 'Internet', systemKey: 'internet', rule: { kind: 'monthly', day: 15 }, amountMode: 'fixed', remindDaysBefore: 1 },
  { key: 'lpg', name: 'LPG', systemKey: 'lpg', rule: { kind: 'after_days', every: 10 }, amountMode: 'varies', remindDaysBefore: 1 },
  {
    key: 'sahod',
    name: 'Sahod',
    systemKey: 'wages',
    rule: { kind: 'twice_monthly', days: [15, 'last'] },
    amountMode: 'fixed',
    remindDaysBefore: 3,
  },
  {
    key: 'government',
    name: 'SSS · PhilHealth · Pag-IBIG',
    systemKey: 'gov_contributions',
    rule: { kind: 'monthly', day: 'last' },
    amountMode: 'fixed',
    remindDaysBefore: 3,
  },
  { key: 'other', name: 'Other', systemKey: 'other', rule: { kind: 'monthly', day: 1 }, amountMode: 'fixed', remindDaysBefore: 1 },
] satisfies BillPreset[])
