/**
 * The report context as the API sends it: what a client needs to draw its
 * filter bar and headings. Never the windows' cache handles or raw scope.
 */

import type { ReportContext, ReportOption } from '../read/report-context'
import type { CompareTo, ReportGrain, ReportPreset } from '../period'

export interface ReportContextPayload {
  period: { preset: ReportPreset; from: string; to: string; label: string; phrase: string; isPartial: boolean; grain: ReportGrain }
  compare: { label: string; phrase: string; kind: string } | null
  compareTo: CompareTo
  branch: string | null
  branchOptions: ReportOption[] | null
  lockedBranchLabel: string | null
  isMultiBranch: boolean
  presets: ReportOption[]
  today: string
  /** The asked-for range could not be shown; the default is shown instead. */
  periodError: string | null
  isScheduleFallback: boolean
}

export function toContextPayload(context: ReportContext): ReportContextPayload {
  const { period, compare } = context
  return {
    period: {
      preset: period.preset,
      from: period.from,
      to: period.to,
      label: period.label,
      phrase: period.phrase,
      isPartial: period.isPartial,
      grain: period.grain,
    },
    compare: compare ? { label: compare.label, phrase: compare.phrase, kind: compare.kind } : null,
    compareTo: context.filter.compareTo ?? 'previous',
    branch: context.branch.branch,
    branchOptions: context.branchOptions,
    lockedBranchLabel: context.lockedBranchLabel,
    isMultiBranch: context.isMultiBranch,
    presets: context.presets,
    today: context.today,
    periodError: context.periodError,
    isScheduleFallback: context.isScheduleFallback,
  }
}
