const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** "45m", "5h", "3.5d" — short enough for a stage card; "—" when unknown. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`
  const days = ms / DAY_MS
  return `${days < 10 ? Math.round(days * 10) / 10 : Math.round(days)}d`
}
