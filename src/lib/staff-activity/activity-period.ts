/**
 * The window a staff report covers, from a query-string key.
 *
 * Whole days ending now, like the app's buildKpiPeriod: a rolling window
 * makes every edge day permanently short. Unknown keys fall back to a week
 * so a hand-edited URL never yields an empty, unexplained page.
 */

export const ACTIVITY_PERIODS = ['today', '7d', '30d'] as const
export type ActivityPeriodKey = (typeof ACTIVITY_PERIODS)[number]

const DAYS: Record<ActivityPeriodKey, number> = { today: 1, '7d': 7, '30d': 30 }
const DAY_MS = 24 * 60 * 60 * 1000

export function parseActivityPeriod(value: string | undefined): ActivityPeriodKey {
  return (ACTIVITY_PERIODS as readonly string[]).includes(value ?? '') ? (value as ActivityPeriodKey) : '7d'
}

export function activityWindow(key: ActivityPeriodKey, nowMs: number): { startMs: number; endMs: number } {
  return { startMs: nowMs - DAYS[key] * DAY_MS, endMs: nowMs }
}

export const ACTIVITY_PERIOD_LABELS: Record<ActivityPeriodKey, string> = {
  today: 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}
