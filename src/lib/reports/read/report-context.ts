/**
 * Everything a sales report page decides before it reads a single figure:
 * may this account see it, which period, which comparison, which branch.
 *
 * Pure (the loader in `load-report-context.ts` fetches the inputs), so the
 * fail-closed rules are tested without a database.
 */

import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from '@/lib/business-day/trading-day'
import type { OrderBackend } from '@/lib/order-backend'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import {
  DEFAULT_REPORT_PRESET,
  REPORT_PRESETS,
  REPORT_PRESET_LABELS,
  UNASSIGNED_BRANCH,
  parseReportSearchParams,
  resolveComparePeriod,
  resolveReportPeriod,
  type ComparePeriod,
  type ReportPeriod,
  type ReportSearchParams,
} from '../period'
import { UNASSIGNED_LABEL } from '../report-view-model'
import type { ReportWindow } from './report-rpc'
import { reportAccessFor, reportBranchArgs, type ReportBranch, type ReportRefusal } from './report-scope'

export interface ReportOutlet {
  id: string
  name: string
  isActive: boolean
}

export interface ReportOption {
  value: string
  label: string
}

export interface ReportContext {
  tenantId: string
  tenantSlug: string
  scope: BranchScope
  isBranchLocked: boolean
  /** The store runs two or more branches (and has the feature on). */
  isMultiBranch: boolean
  /** id → name for every outlet the store has had, inactive ones included. */
  outletNames: ReadonlyMap<string, string>
  branch: ReportBranch
  /** The filter state the page actually shows (an invalid URL value falls back). */
  filter: ReportSearchParams
  period: ReportPeriod
  /** null = comparison switched off. */
  compare: ComparePeriod | null
  /** The URL asked for a range that cannot be shown; the default is shown instead. */
  periodError: string | null
  /** Store-local today, YYYY-MM-DD. */
  today: string
  windows: { current: ReportWindow; previous: ReportWindow | null }
  presets: ReportOption[]
  /** null = no branch picker. */
  branchOptions: ReportOption[] | null
  lockedBranchLabel: string | null
  /** A platform store with a Convex deployment left over: older orders may live there. */
  isMixedBackend: boolean
  /** The business-day cutoffs every window above was built on. */
  schedule: CutoffSchedule
  /** The schedule could not be read; days are midnight-to-midnight and the page should say so. */
  isScheduleFallback: boolean
}

export type ReportPageState =
  | { kind: 'ready'; context: ReportContext }
  | { kind: 'refused'; reason: ReportRefusal }
  | { kind: 'unsupported'; backend: OrderBackend }

export interface BuildReportContextInput {
  tenant: { id: string; slug: string; multiBranchEnabled: boolean; hasConvexDeployment: boolean }
  backend: OrderBackend
  appUser: AppUserScopeRow | null
  outlets: readonly ReportOutlet[]
  searchParams: Record<string, string | string[] | undefined>
  now: number
  /** The store's business-day cutoffs; none = Manila midnight. */
  schedule?: CutoffSchedule
  isScheduleFallback?: boolean
}

const PRESET_OPTIONS: ReportOption[] = REPORT_PRESETS.map((preset) => ({ value: preset, label: REPORT_PRESET_LABELS[preset] }))

function resolvePeriodOrDefault(
  filter: ReportSearchParams,
  now: number,
  schedule: CutoffSchedule,
): { period: ReportPeriod; error: string | null; filter: ReportSearchParams } {
  const resolved = resolveReportPeriod({ preset: filter.preset, from: filter.from, to: filter.to }, now, schedule)
  if (resolved.ok) return { period: resolved.period, error: null, filter }
  const fallback = resolveReportPeriod({ preset: DEFAULT_REPORT_PRESET }, now, schedule)
  // The default preset always resolves; a failure here is a bug, not input.
  if (!fallback.ok) throw new Error(fallback.error)
  return {
    period: fallback.period,
    error: resolved.error,
    filter: { ...filter, preset: DEFAULT_REPORT_PRESET, from: null, to: null },
  }
}

export function buildReportContext(input: BuildReportContextInput): ReportPageState {
  const access = reportAccessFor(input.appUser, input.tenant.id)
  if (!access.ok) return { kind: 'refused', reason: access.reason }
  if (input.backend !== 'platform') return { kind: 'unsupported', backend: input.backend }

  const schedule = input.schedule ?? MIDNIGHT_SCHEDULE
  const parsed = parseReportSearchParams(input.searchParams)
  const { period, error, filter: periodFilter } = resolvePeriodOrDefault(parsed, input.now, schedule)
  const compare = parsed.compare ? resolveComparePeriod(period, schedule) : null

  const activeOutlets = input.outlets.filter((outlet) => outlet.isActive)
  const isMultiBranch = input.tenant.multiBranchEnabled && activeOutlets.length >= 2
  const isBranchLocked = access.scope.kind === 'branch'
  const branch = reportBranchArgs(
    access.scope,
    parsed.branch,
    input.outlets.map((outlet) => outlet.id),
  )
  const outletNames = new Map(input.outlets.map((outlet) => [outlet.id, outlet.name]))

  const window = (start: number, end: number): ReportWindow => ({ tenantId: input.tenant.id, start, end, branch: branch.args })
  const today = resolveReportPeriod({ preset: 'today' }, input.now, schedule)
  if (!today.ok) throw new Error(today.error)

  return {
    kind: 'ready',
    context: {
      tenantId: input.tenant.id,
      tenantSlug: input.tenant.slug,
      scope: access.scope,
      isBranchLocked,
      isMultiBranch,
      outletNames,
      branch,
      // A branch-locked account's URL never decides its branch.
      filter: { ...periodFilter, branch: isBranchLocked ? null : branch.branch },
      period,
      compare,
      periodError: error,
      today: today.period.from,
      windows: {
        current: window(period.start, period.end),
        previous: compare ? window(compare.start, compare.end) : null,
      },
      presets: PRESET_OPTIONS,
      branchOptions:
        isMultiBranch && !isBranchLocked
          ? [
              ...activeOutlets.map((outlet) => ({ value: outlet.id, label: outlet.name })),
              { value: UNASSIGNED_BRANCH, label: UNASSIGNED_LABEL },
            ]
          : null,
      lockedBranchLabel:
        access.scope.kind === 'branch' ? (outletNames.get(access.scope.outletId) ?? 'Your branch') : null,
      isMixedBackend: input.tenant.hasConvexDeployment,
      schedule,
      isScheduleFallback: input.isScheduleFallback === true,
    },
  }
}
