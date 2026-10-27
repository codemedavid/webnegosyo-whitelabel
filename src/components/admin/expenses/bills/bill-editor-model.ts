/**
 * The Add / Edit bill form as data (bills-contract §3, §5).
 *
 * Pure. "How often" is a plain sentence the owner picks ("Every month",
 * "Twice a month", "About every few days"); this file turns those choices into
 * the engine's `BillRule` and back. Every business rule (name, amount bounds,
 * rule shape, start-date window, reminder range, never the drawer) is the
 * shared `validateBillDraft`, so the web and the phone refuse the same drafts
 * with the same words. Ingredients are never a bill: stock receiving already
 * counts that cost.
 */

import {
  BILL_PRESETS,
  BILL_REMIND_MAX_DAYS,
  nextDueDates,
  validateBillDraft,
  type Bill,
  type BillDraftField,
  type BillPaidFrom,
  type BillPayment,
  type BillPreset,
  type BillRule,
  type DayOfMonth,
} from '@/lib/expenses/bill-schedule'
import { parsePesoInput } from '@/lib/expenses/keypad'
import type { ExpenseCategory } from '@/lib/expenses/types'
import { amountText } from './bill-board-model'

export type RepeatChoice = 'monthly' | 'twice_monthly' | 'weekly' | 'every_2_weeks' | 'months' | 'yearly' | 'after_days'

export const REPEAT_OPTIONS: readonly { value: RepeatChoice; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'twice_monthly', label: 'Twice a month' },
  { value: 'weekly', label: 'Every week' },
  { value: 'every_2_weeks', label: 'Every 2 weeks' },
  { value: 'months', label: 'Every few months' },
  { value: 'yearly', label: 'Every year' },
  { value: 'after_days', label: 'About every few days, after the last one (like LPG)' },
]

export type MonthsEvery = 2 | 3 | 4 | 6

export const MONTHS_EVERY_OPTIONS: readonly MonthsEvery[] = [2, 3, 4, 6]

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** Days a bill can fall on: 1st..31st, then "Last day". */
export const DAY_OPTIONS: readonly DayOfMonth[] = [...Array.from({ length: 31 }, (_, index) => index + 1), 'last']

export const REMIND_OPTIONS: readonly number[] = Array.from({ length: BILL_REMIND_MAX_DAYS + 1 }, (_, index) => index)

export function dayOptionLabel(day: DayOfMonth): string {
  if (day === 'last') return 'Last day of the month'
  const lastTwo = day % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th')
  return `${day}${suffix}`
}

export function remindLabel(days: number): string {
  if (days === 0) return 'On the day'
  return days === 1 ? '1 day before' : `${days} days before`
}

export type AmountMode = 'fixed' | 'varies'

export interface BillEditorState {
  presetKey: string | null
  name: string
  categoryId: string | null
  amountMode: AmountMode
  amountText: string
  repeat: RepeatChoice
  /** monthly / months / yearly. */
  day: DayOfMonth
  /** twice_monthly: the first is `day`. */
  secondDay: DayOfMonth
  weekday: number
  monthsEvery: MonthsEvery
  everyDaysText: string
  remindDaysBefore: number
  paidFrom: BillPaidFrom
  supplierId: string | null
  paidToName: string
  /** null = whole store. */
  outletId: string | null
  startsOn: string
  /** Kept as it is on an edit; the form has no end date. */
  endsOn: string | null
}

const DEFAULT_AFTER_DAYS = '10'
const DEFAULT_REMIND_DAYS = 1

function dayOfMonthOf(date: string): number {
  return Number(date.slice(8, 10))
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

export function blankEditor(today: string, outletId: string | null = null): BillEditorState {
  return {
    presetKey: null,
    name: '',
    categoryId: null,
    amountMode: 'fixed',
    amountText: '',
    repeat: 'monthly',
    day: dayOfMonthOf(today),
    secondDay: 'last',
    weekday: weekdayOf(today),
    monthsEvery: 3,
    everyDaysText: DEFAULT_AFTER_DAYS,
    remindDaysBefore: DEFAULT_REMIND_DAYS,
    paidFrom: 'cash',
    supplierId: null,
    paidToName: '',
    outletId,
    startsOn: today,
    endsOn: null,
  }
}

/** The rule's fields in editor terms; anything a rule doesn't use keeps `base`. */
function ruleFields(rule: BillRule, base: BillEditorState): Partial<BillEditorState> {
  switch (rule.kind) {
    case 'monthly':
      return { repeat: 'monthly', day: rule.day }
    case 'twice_monthly':
      return { repeat: 'twice_monthly', day: rule.days[0], secondDay: rule.days[1] }
    case 'weekly':
      return { repeat: rule.every === 2 ? 'every_2_weeks' : 'weekly', weekday: rule.weekday }
    case 'months':
      return rule.every === 12
        ? { repeat: 'yearly', day: rule.day }
        : { repeat: 'months', day: rule.day, monthsEvery: rule.every as MonthsEvery }
    case 'after_days':
      return { repeat: 'after_days', everyDaysText: String(rule.every) }
    default:
      return { repeat: base.repeat }
  }
}

export function editorFromBill(bill: Bill): BillEditorState {
  const base = blankEditor(bill.startsOn, bill.outletId)
  return {
    ...base,
    ...ruleFields(bill.rule, base),
    name: bill.name,
    categoryId: bill.categoryId,
    amountMode: bill.amountCents === null ? 'varies' : 'fixed',
    amountText: bill.amountCents === null ? '' : amountText(bill.amountCents),
    remindDaysBefore: bill.remindDaysBefore,
    paidFrom: bill.paidFrom,
    supplierId: bill.supplierId,
    paidToName: bill.paidToName ?? '',
    startsOn: bill.startsOn,
    endsOn: bill.endsOn,
  }
}

/** Categories a bill may use: never Ingredients (the one already on an old bill stays visible so its name shows). */
export function billableCategories(categories: readonly ExpenseCategory[], keepId: string | null = null): ExpenseCategory[] {
  return categories.filter((category) => category.group !== 'ingredients' || category.id === keepId)
}

/** The preset's seeded category, when the store still has it active and it can carry a bill. */
export function presetCategoryId(preset: BillPreset, categories: readonly ExpenseCategory[]): string | null {
  const match = categories.find(
    (category) => category.systemKey === preset.systemKey && category.archivedAt === null && category.group !== 'ingredients',
  )
  return match?.id ?? null
}

/** A preset fills the name, category, how often, fixed / changes and the reminder lead. Amount and the rest stay. */
export function applyPreset(state: BillEditorState, preset: BillPreset, categories: readonly ExpenseCategory[]): BillEditorState {
  const withRule = { ...state, ...ruleFields(preset.rule, state) }
  return {
    ...withRule,
    presetKey: preset.key,
    // "Other" is a starting point: the owner names it.
    name: preset.key === 'other' ? '' : preset.name,
    categoryId: presetCategoryId(preset, categories) ?? state.categoryId,
    amountMode: preset.amountMode,
    amountText: preset.amountMode === 'varies' ? '' : state.amountText,
    remindDaysBefore: preset.remindDaysBefore,
  }
}

export function findPreset(key: string): BillPreset | undefined {
  return BILL_PRESETS.find((preset) => preset.key === key)
}

/** The engine rule for what is picked. A bad "every N days" stays bad so the engine can say why. */
export function ruleOf(state: BillEditorState): BillRule {
  switch (state.repeat) {
    case 'monthly':
      return { kind: 'monthly', day: state.day }
    case 'twice_monthly':
      return { kind: 'twice_monthly', days: [state.day, state.secondDay] }
    case 'weekly':
      return { kind: 'weekly', every: 1, weekday: state.weekday }
    case 'every_2_weeks':
      return { kind: 'weekly', every: 2, weekday: state.weekday }
    case 'months':
      return { kind: 'months', every: state.monthsEvery, day: state.day }
    case 'yearly':
      return { kind: 'months', every: 12, day: state.day }
    case 'after_days': {
      const text = state.everyDaysText.trim()
      return { kind: 'after_days', every: text === '' ? 0 : Number(text) }
    }
  }
}

/** What `createBillAction` / `updateBillAction` take as the draft (billDraftSchema, strict). */
export interface BillDraftPayload {
  name: string
  categoryId: string
  outletId: string | null
  supplierId: string | null
  paidToName: string | null
  paidFrom: BillPaidFrom
  amountCents: number | null
  rule: BillRule
  startsOn: string
  endsOn: string | null
  remindDaysBefore: number
}

function fixedAmount(state: BillEditorState): number | null {
  return state.amountText.trim() === '' ? null : parsePesoInput(state.amountText)
}

export function draftOf(state: BillEditorState): BillDraftPayload {
  const paidTo = state.paidToName.trim()
  return {
    name: state.name.trim(),
    categoryId: state.categoryId ?? '',
    outletId: state.outletId,
    supplierId: state.supplierId,
    paidToName: state.supplierId || paidTo === '' ? null : paidTo,
    paidFrom: state.paidFrom,
    amountCents: state.amountMode === 'varies' ? null : fixedAmount(state),
    rule: ruleOf(state),
    startsOn: state.startsOn,
    endsOn: state.endsOn,
    remindDaysBefore: state.remindDaysBefore,
  }
}

export interface EditorProblem {
  field: BillDraftField
  message: string
}

/** The form's first problem, as a sentence next to its field; null = ready to save. */
export function editorProblem(
  state: BillEditorState,
  categoriesById: ReadonlyMap<string, ExpenseCategory>,
  today: string,
  /** The saved bill's start date when editing: an old bill keeps its own. */
  savedStartsOn: string | null = null,
): EditorProblem | null {
  if (state.name.trim() === '') return { field: 'name', message: 'Give the bill a name.' }
  const category = state.categoryId ? categoriesById.get(state.categoryId) : undefined
  if (!category) return { field: 'categoryId', message: 'Pick a category.' }
  if (category.group === 'ingredients') {
    return { field: 'categoryId', message: 'Ingredients are counted when you receive stock, so they can’t be a bill.' }
  }
  if (state.amountMode === 'fixed') {
    const cents = fixedAmount(state)
    if (cents === null || cents <= 0) {
      return { field: 'amountCents', message: 'Enter the amount, or pick “Changes every time”.' }
    }
  }
  const check = validateBillDraft(draftOf(state), today, { savedStartsOn })
  return check.ok ? null : { field: check.field, message: `${check.message}.` }
}

/** The next three due dates for what is picked; [] while the rule or start date can't be read yet. */
export function previewDates(state: BillEditorState, today: string, billId?: string, payments: readonly BillPayment[] = []): string[] {
  const rule = ruleOf(state)
  const probe = validateBillDraft(
    { name: 'x', categoryId: 'x', amountCents: null, rule, startsOn: state.startsOn, endsOn: state.endsOn, remindDaysBefore: 0, paidFrom: 'cash' },
    today,
    // A preview never refuses an old start date; saving decides that.
    { savedStartsOn: state.startsOn },
  )
  if (!probe.ok) return []
  try {
    return nextDueDates({ id: billId, rule, startsOn: state.startsOn, endsOn: state.endsOn }, today, 3, payments)
  } catch {
    return []
  }
}
