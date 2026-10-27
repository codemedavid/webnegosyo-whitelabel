/**
 * Everything the "Cash & remits" page decides before it reads a figure: may
 * this account open it, which business day, which branch, which tab, and
 * whether it may change the business-day cutoff.
 *
 * Pure (the page fetches the inputs), so the fail-closed rules are tested
 * without a database. RLS refuses the same callers; this decides what the
 * page SAYS, it is not the boundary.
 *
 * - The page needs `cash_manage` (ADMIN_SECTION_PERMISSIONS `cash`).
 * - The cutoff needs the owner, or `settings` on a store-wide account, like
 *   `set_business_day_cutoff` (it moves every report, so not `cash_manage`).
 * - A branch-locked account reads its own branch whatever the URL says.
 */

import { cutoffMinutesFor, describeCutoff, tradingDayOf, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { nextBusinessDayKey, previousBusinessDayKey } from '@/lib/inventory/business-day'
import { resolveBranchScope, type BranchScope } from '@/lib/outlets/branch-scope'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { hasPermission } from '@/lib/staff-permissions'

export type CashRefusal = 'no_account' | 'other_store' | 'no_permission'

export type CashAccess =
  | { ok: true; scope: BranchScope; canChangeCutoff: boolean }
  | { ok: false; reason: CashRefusal }

export function cashAccessFor(appUser: AppUserScopeRow | null, tenantId: string): CashAccess {
  if (!appUser) return { ok: false, reason: 'no_account' }
  if (appUser.role === 'superadmin') return { ok: true, scope: { kind: 'all' }, canChangeCutoff: true }
  // `app_user_has_permission` has no platform-staff branch: every cash read and write would refuse them.
  if (appUser.role !== 'admin') return { ok: false, reason: 'no_permission' }
  if (appUser.tenant_id !== tenantId) return { ok: false, reason: 'other_store' }
  if (!hasPermission(appUser, 'cash_manage')) return { ok: false, reason: 'no_permission' }
  const scope = resolveBranchScope(appUser)
  const isStoreWide = scope.kind === 'all' || appUser.is_owner === true
  return { ok: true, scope, canChangeCutoff: isStoreWide && hasPermission(appUser, 'settings') }
}

export const CASH_TABS = ['shifts', 'settings'] as const
export type CashTab = (typeof CASH_TABS)[number]

export interface CashOutlet {
  id: string
  name: string
  isActive: boolean
}

export interface CashPageContext {
  tenantId: string
  tenantSlug: string
  scope: BranchScope
  canChangeCutoff: boolean
  tab: CashTab
  /** The business day shown, YYYY-MM-DD. */
  day: string
  /** The business day running now. */
  today: string
  previousDay: string
  /** null on today: a future day has nothing to show. */
  nextDay: string | null
  /** The branch read; null = every branch the caller reaches. */
  outletId: string | null
  /** null = no branch picker (single branch, or a branch-locked account). */
  branchOptions: Array<{ value: string; label: string }> | null
  lockedBranchLabel: string | null
  outletNames: Record<string, string>
  /** "4:00 AM" / "12:00 AM (midnight)" for the day shown. */
  cutoffLabel: string
  cutoffMinutes: number
  /** The day asked for in the URL could not be shown. */
  dayError: string | null
}

export type CashPageState = { kind: 'ready'; context: CashPageContext } | { kind: 'refused'; reason: CashRefusal }

type Query = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || null
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function isRealDay(value: string): boolean {
  return DAY_KEY.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

export interface BuildCashPageInput {
  tenant: { id: string; slug: string; multiBranchEnabled: boolean }
  appUser: AppUserScopeRow | null
  outlets: readonly CashOutlet[]
  searchParams: Query
  schedule: CutoffSchedule
  now: number
}

function resolveDay(requested: string | null, today: string): { day: string; error: string | null } {
  if (requested === null) return { day: today, error: null }
  if (!isRealDay(requested)) return { day: today, error: 'That date can’t be read. Showing today instead.' }
  if (requested > today) return { day: today, error: 'That day hasn’t happened yet. Showing today instead.' }
  return { day: requested, error: null }
}

function resolveOutlet(scope: BranchScope, requested: string | null, outlets: readonly CashOutlet[]): string | null {
  if (scope.kind === 'branch') return scope.outletId
  return requested !== null && outlets.some((outlet) => outlet.id === requested) ? requested : null
}

export function buildCashPage(input: BuildCashPageInput): CashPageState {
  const access = cashAccessFor(input.appUser, input.tenant.id)
  if (!access.ok) return { kind: 'refused', reason: access.reason }

  const today = tradingDayOf(new Date(input.now).toISOString(), input.schedule)
  const { day, error } = resolveDay(first(input.searchParams.day), today)
  const tabParam = first(input.searchParams.tab)
  const tab: CashTab = tabParam === 'settings' ? 'settings' : 'shifts'

  const activeOutlets = input.outlets.filter((outlet) => outlet.isActive)
  const isMultiBranch = input.tenant.multiBranchEnabled && activeOutlets.length >= 2
  const outletNames = Object.fromEntries(input.outlets.map((outlet) => [outlet.id, outlet.name]))
  const cutoffMinutes = cutoffMinutesFor(input.schedule, day)

  return {
    kind: 'ready',
    context: {
      tenantId: input.tenant.id,
      tenantSlug: input.tenant.slug,
      scope: access.scope,
      canChangeCutoff: access.canChangeCutoff,
      tab,
      day,
      today,
      previousDay: previousBusinessDayKey(day),
      nextDay: day < today ? nextBusinessDayKey(day) : null,
      outletId: resolveOutlet(access.scope, first(input.searchParams.branch), input.outlets),
      branchOptions:
        isMultiBranch && access.scope.kind === 'all' ? activeOutlets.map((outlet) => ({ value: outlet.id, label: outlet.name })) : null,
      lockedBranchLabel: access.scope.kind === 'branch' ? (outletNames[access.scope.outletId] ?? 'Your branch') : null,
      outletNames,
      cutoffLabel: describeCutoff(cutoffMinutes).label,
      cutoffMinutes,
      dayError: error,
    },
  }
}

/** `/<slug>/admin/cash?…`, keeping only what differs from the defaults. */
export function cashHref(
  tenantSlug: string,
  params: { tab?: CashTab; day?: string | null; branch?: string | null; today?: string },
): string {
  const query = new URLSearchParams()
  if (params.tab && params.tab !== 'shifts') query.set('tab', params.tab)
  if (params.day && params.day !== params.today) query.set('day', params.day)
  if (params.branch) query.set('branch', params.branch)
  const text = query.toString()
  return `/${encodeURIComponent(tenantSlug)}/admin/cash${text ? `?${text}` : ''}`
}
