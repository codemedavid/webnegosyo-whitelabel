import { toReportSearchParams, type ReportPreset, type ReportSearchParams } from './period'

/** The filter state as the URL and the filter bar carry it (the preset as a plain string). */
export interface ReportLinkFilter extends Omit<ReportSearchParams, 'preset'> {
  preset: ReportPreset | string
}

/**
 * A report URL that keeps the period, branch and comparison (plan §3.3: all
 * filter state lives in the URL), plus the page's own params.
 */
export function reportHref(
  path: string,
  filter: ReportLinkFilter,
  pageParams: Record<string, string | null | undefined> = {},
): string {
  const query = toReportSearchParams(filter as ReportSearchParams)
  for (const [key, value] of Object.entries(pageParams)) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `${path}?${text}` : path
}
