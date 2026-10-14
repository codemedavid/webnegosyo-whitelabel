'use client'

import { MAX_REPORT_DAYS } from '@/lib/reports/period'
import { reportHref } from '@/lib/reports/report-links'
import type { FilterOption } from './filter-controls'
import { ReportFilterBar, type ReportFilterValue } from './report-filter-bar'

interface ReportFiltersProps {
  /** The page's path, tenant prefix included. */
  path: string
  presets: FilterOption[]
  value: ReportFilterValue
  branches: FilterOption[] | null
  isBranchLocked: boolean
  lockedBranchLabel: string | null
  today: string
  /** Params the page keeps across filter changes (the Items view). */
  pageParams?: Record<string, string | null>
}

/**
 * The filter bar on a report page. A server page cannot hand a function to a
 * client component, so the href builder lives here.
 */
export function ReportFilters({
  path,
  presets,
  value,
  branches,
  isBranchLocked,
  lockedBranchLabel,
  today,
  pageParams,
}: ReportFiltersProps) {
  return (
    <ReportFilterBar
      presets={presets}
      value={value}
      branches={branches}
      isBranchLocked={isBranchLocked}
      lockedBranchLabel={lockedBranchLabel ?? undefined}
      buildHref={(next) => reportHref(path, next, pageParams)}
      maxDays={MAX_REPORT_DAYS}
      today={today}
    />
  )
}
