/**
 * What the Profit page decides before and after it reads (expense plan §5.3).
 * Pure: access, which windows to read, and the words the trust strip says.
 */

import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { hasPermission } from '@/lib/staff-permissions'
import { formatMoney, formatRatio } from './format'
import type { ReportGrain, ReportPeriod } from './period'
import type { ProfitGrain } from './profit-facts'
import type { CashFlowLine, ProfitFinding } from './profit-model'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MANILA_OFFSET_MS = 8 * HOUR_MS
/** A period shorter than a week has no "previous period" worth comparing bills against. */
const WEEK_MS = 7 * DAY_MS

export const PROFIT_LOCKED_MESSAGE = 'Ask the owner for cost access to see profit.'

export type ProfitView = 'profit' | 'cash'

export function parseProfitView(raw: string | string[] | undefined): ProfitView {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'cash' ? 'cash' : 'profit'
}

/**
 * Profit needs `expenses` and `costs` on top of `reports` (which the report
 * context already checked). Store accounts only: support staff and
 * superadmins cannot read a store's expense book (its RLS), so they would
 * see a profit with no expenses in it.
 */
export function canSeeProfit(appUser: AppUserScopeRow | null, tenantId: string): boolean {
  if (!appUser || appUser.role !== 'admin' || appUser.tenant_id !== tenantId) return false
  return hasPermission(appUser, 'expenses') && hasPermission(appUser, 'costs')
}

/** The trend never goes finer than a day (expenses are dated, not timed). */
export function profitGrainFor(grain: ReportGrain): ProfitGrain {
  return grain === 'hour' ? 'day' : grain
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`) - MANILA_OFFSET_MS
}

function previousMonthFirst(day: string): string {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`
}

/**
 * The whole period before this one, for "you paid rent last month but not
 * yet this month": the previous calendar month for month periods, otherwise
 * the same natural length just before. Null for periods under a week.
 */
export function previousFullWindow(period: ReportPeriod): { start: number; end: number } | null {
  if (period.preset === 'this_month' || period.preset === 'last_month') {
    return { start: dayStart(previousMonthFirst(period.from)), end: period.start }
  }
  // A running week is still a seven-day week (as resolveComparePeriod).
  const length = period.preset === 'this_week' ? WEEK_MS : period.fullEnd - period.start
  if (length < WEEK_MS) return null
  return { start: period.start - length, end: period.start }
}

export interface FindingAction {
  label: string
  href: string
}

export interface FindingCopy {
  key: string
  tone: 'warning' | 'info'
  text: string
  action: FindingAction | null
}

export interface FindingLinks {
  /** `/<tenant>/admin`. */
  adminBase: string
  periodPhrase: string
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** One trust-strip row per finding; each warning says what to do. */
export function findingCopy(finding: ProfitFinding, { adminBase, periodPhrase }: FindingLinks): FindingCopy {
  const expenses = `${adminBase}/expenses`
  switch (finding.kind) {
    case 'missing_recurring':
      return {
        key: `missing:${finding.categoryId}`,
        tone: 'warning',
        text: `No ${finding.categoryName} recorded ${periodPhrase}. Profit looks higher than it is.`,
        action: { label: 'Record', href: `${expenses}?add=${encodeURIComponent(finding.categoryId)}` },
      }
    case 'no_expenses':
      return {
        key: 'no_expenses',
        tone: 'warning',
        text: `No expenses recorded ${periodPhrase}. Empty can mean missing, so this profit is too high until they are in.`,
        action: { label: 'Add expense', href: `${expenses}?add=1` },
      }
    case 'uncosted_dishes':
      return {
        key: 'uncosted_dishes',
        tone: 'warning',
        text: `Ingredient cost is estimated: ${plural(finding.uncostedDishes, 'dish has', 'dishes have')} no recipe (${formatRatio(finding.uncostedShare)} of what sold).`,
        action: { label: 'Add recipes', href: `${adminBase}/menu` },
      }
    case 'unsorted_payouts':
      return {
        key: 'unsorted_payouts',
        tone: 'warning',
        text: `${plural(finding.count, 'drawer pay-out', 'drawer pay-outs')} (${formatMoney(finding.cents)}) not sorted yet, so not in Expenses.`,
        action: { label: 'Sort', href: `${expenses}?view=unsorted` },
      }
    case 'ingredient_estimate':
      return {
        key: 'ingredient_estimate',
        tone: 'info',
        text: 'Ingredients are an estimate: based on what you bought, not what you used.',
        action: null,
      }
    case 'uncosted_movements':
      return {
        key: 'uncosted_movements',
        tone: 'info',
        text: `${plural(finding.count, 'stock movement has', 'stock movements have')} no cost recorded, so ${finding.count === 1 ? 'it adds' : 'they add'} nothing to ingredients.`,
        action: null,
      }
    case 'dish_costs_hidden':
      return {
        key: 'dish_costs_hidden',
        tone: 'info',
        text: 'Ingredients here count your branch’s stock use only. Dish costs for sales without stock records are visible to store-wide accounts.',
        action: null,
      }
    case 'store_wide_excluded':
      return {
        key: 'store_wide_excluded',
        tone: 'info',
        text: `${formatMoney(finding.cents)} of store-wide costs (not tied to a branch) are left out of this branch’s profit.`,
        action: null,
      }
  }
}

export const CASH_OUT_LABELS: Readonly<Record<CashFlowLine['key'], string>> = {
  ingredients_stock: 'Stock purchases',
  ingredients_direct: 'Ingredients (not stocked)',
  staff: 'Staff',
  occupancy: 'Rent',
  utilities: 'Utilities',
  operating: 'Operating',
  admin: 'Admin & permits',
  other: 'Other',
  capex: 'Big purchases (equipment)',
  not_expense: 'Not expenses (owner took cash, deposits, loans)',
}

/** The bucket still running (the period is "so far" and this bucket holds now). */
export function isIncompleteBucket(bucketKeys: readonly string[], index: number, period: Pick<ReportPeriod, 'isPartial'>): boolean {
  return period.isPartial && index === bucketKeys.length - 1
}
