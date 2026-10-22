/**
 * Expense categories: the seed list every store starts with, the owner-facing
 * group names, and the order the Add-expense picker shows them in.
 *
 * The hidden GROUP drives Profit (plan §3), so the owner never sees accounting
 * words: "Rent", not "Occupancy"; "Big purchases", not "Capex".
 *
 * `SEED_CATEGORIES` mirrors `ensure_expense_categories` (contract §4) row for
 * row; sort order is the row index × 10. Copied byte-for-byte into the
 * merchant app (`tests/unit/expenses/app-parity.test.ts`).
 */
import { addDays, manilaHourOf, todayInManila } from './manila-date'
import { OPERATING_GROUPS, type Expense, type ExpenseCategory, type ExpenseGroup } from './types'

export interface SeedCategory {
  readonly systemKey: string
  readonly name: string
  readonly group: ExpenseGroup
  readonly icon: string
  readonly needsNote: boolean
  readonly sortOrder: number
}

type SeedRow = readonly [systemKey: string, name: string, group: ExpenseGroup, icon: string, needsNote: boolean]

const SEED_ROWS: readonly SeedRow[] = [
  ['ingredients', 'Ingredients (Palengke)', 'ingredients', 'IN', false],
  ['ice', 'Ice (Yelo)', 'ingredients', 'IC', false],
  ['drinks', 'Drinks & bar stock', 'ingredients', 'DR', false],
  ['packaging', 'Packaging (Lalagyan)', 'ingredients', 'PK', false],
  ['wages', 'Salaries & wages (Sahod)', 'staff', 'SW', false],
  ['gov_contributions', 'SSS / PhilHealth / Pag-IBIG', 'staff', 'GC', false],
  ['staff_meals', 'Staff meals & allowances', 'staff', 'SM', false],
  ['thirteenth_month', '13th month', 'staff', '13', false],
  ['rent', 'Rent (Upa)', 'occupancy', 'RE', false],
  ['electricity', 'Electricity (Kuryente)', 'utilities', 'EL', false],
  ['water', 'Water (Tubig)', 'utilities', 'WA', false],
  ['lpg', 'Gas / LPG', 'utilities', 'LP', false],
  ['internet', 'Internet & load', 'utilities', 'NT', false],
  ['delivery_fees', 'Delivery & rider fees', 'operating', 'DF', false],
  ['platform_fees', 'Platform & payment fees', 'operating', 'PF', false],
  ['transport', 'Transport (Pamasahe)', 'operating', 'TR', false],
  ['cleaning', 'Cleaning & supplies', 'operating', 'CL', false],
  ['repairs', 'Repairs (Pagawa)', 'operating', 'RP', false],
  ['marketing', 'Marketing & ads', 'operating', 'MK', false],
  ['permits', 'Permits & taxes', 'admin', 'PT', false],
  ['accounting', 'Accountant & software', 'admin', 'AC', false],
  ['bank_charges', 'Bank charges', 'admin', 'BC', false],
  ['other', 'Other', 'other', 'OT', true],
  ['equipment', 'Big purchase (equipment)', 'capex', 'EQ', false],
  ['owner_draw', 'Owner took cash (Kinuha ng may-ari)', 'not_expense', 'OW', false],
  ['bank_deposit', 'Bank deposit', 'not_expense', 'BD', false],
  ['loan_payment', 'Loan payment', 'not_expense', 'LN', false],
]

export const SEED_CATEGORIES: readonly SeedCategory[] = Object.freeze(
  SEED_ROWS.map(([systemKey, name, group, icon, needsNote], index) =>
    Object.freeze({ systemKey, name, group, icon, needsNote, sortOrder: index * 10 }),
  ),
)

/** What the owner reads for each group. */
export const GROUP_LABELS: Readonly<Record<ExpenseGroup, string>> = Object.freeze({
  ingredients: 'Ingredients',
  staff: 'Staff',
  occupancy: 'Rent',
  utilities: 'Utilities',
  operating: 'Running the store',
  admin: 'Admin',
  other: 'Other',
  capex: 'Big purchases',
  not_expense: 'Not an expense',
})

/** Reduces operating profit. */
export function isOperatingGroup(group: ExpenseGroup): boolean {
  return OPERATING_GROUPS.includes(group)
}

/**
 * Reduces profit at all. Big purchases sit below operating profit but still
 * count; "not an expense" (owner took cash, bank deposit, loan payment) only
 * moves cash.
 */
export function affectsProfit(group: ExpenseGroup): boolean {
  return group !== 'not_expense'
}

function bySortOrder(a: ExpenseCategory, b: ExpenseCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** A new array in display order: sortOrder, then name. */
export function sortCategories(categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return [...categories].sort(bySortOrder)
}

/** Category chips shown before "More…" (plan §5.1). */
export const PICKER_TOP_COUNT = 8

/** How far back "most used" looks. */
const PICKER_WINDOW_DAYS = 60

/** Hours either side of now that count as "this time of day". */
const TIME_OF_DAY_WINDOW_HOURS = 2

/**
 * Most a time-of-day match can add. Kept under one use so it only reorders
 * categories used equally often, never jumps a more used one.
 */
const TIME_OF_DAY_NUDGE = 0.9

interface Usage {
  count: number
  nearNow: number
}

function hourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 24
  return Math.min(diff, 24 - diff)
}

function usageByCategory(recentExpenses: readonly Expense[], now: Date): Map<string, Usage> {
  const today = todayInManila(now)
  const since = addDays(today, -PICKER_WINDOW_DAYS)
  const hourNow = manilaHourOf(now.toISOString())
  const usage = new Map<string, Usage>()
  for (const expense of recentExpenses) {
    if (expense.status !== 'recorded' || expense.spentOn < since || expense.spentOn > today) continue
    const isNearNow = hourDistance(manilaHourOf(expense.createdAt), hourNow) <= TIME_OF_DAY_WINDOW_HOURS
    const previous = usage.get(expense.categoryId) ?? { count: 0, nearNow: 0 }
    usage.set(expense.categoryId, { count: previous.count + 1, nearNow: previous.nearNow + (isNearNow ? 1 : 0) })
  }
  return usage
}

/**
 * The picker's order: the `topCount` categories used most over the last 60
 * days (gently nudged toward what is usually bought at this hour), then every
 * other active category by sortOrder. Archived categories are left out.
 */
export function rankCategoriesForPicker(
  categories: readonly ExpenseCategory[],
  recentExpenses: readonly Expense[],
  now: Date,
  topCount: number = PICKER_TOP_COUNT,
): ExpenseCategory[] {
  const active = sortCategories(categories.filter((category) => category.archivedAt === null))
  const usage = usageByCategory(recentExpenses, now)
  const score = (category: ExpenseCategory): number => {
    const used = usage.get(category.id)
    return used ? used.count + TIME_OF_DAY_NUDGE * (used.nearNow / used.count) : 0
  }
  const top = active
    .filter((category) => score(category) > 0)
    .sort((a, b) => score(b) - score(a) || bySortOrder(a, b))
    .slice(0, Math.max(0, topCount))
  const topIds = new Set(top.map((category) => category.id))
  return [...top, ...active.filter((category) => !topIds.has(category.id))]
}
