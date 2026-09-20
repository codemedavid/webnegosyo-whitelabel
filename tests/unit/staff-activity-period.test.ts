import { activityWindow, parseActivityPeriod } from '@/lib/staff-activity/activity-period'

describe('activity period', () => {
  test('unknown keys fall back to a week', () => {
    expect(parseActivityPeriod(undefined)).toBe('7d')
    expect(parseActivityPeriod('yesterday')).toBe('7d')
    expect(parseActivityPeriod('30d')).toBe('30d')
  })

  test('the window ends now and starts whole days earlier', () => {
    const now = Date.parse('2026-09-19T12:00:00Z')
    expect(activityWindow('today', now)).toEqual({ startMs: now - 86_400_000, endMs: now })
    expect(activityWindow('30d', now).startMs).toBe(now - 30 * 86_400_000)
  })
})
