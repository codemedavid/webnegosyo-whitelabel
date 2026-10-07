/** @jest-environment node */
import {
  STALE_BUILD_MS,
  displayedBuildStatus,
  isBuildRetryable,
  staleBuildCutoff,
} from '@/lib/onboarding/build-staleness'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

describe('build staleness', () => {
  test('a stale build outlives the route maxDuration (300s)', () => {
    expect(STALE_BUILD_MS).toBeGreaterThan(300_000)
  })

  test('a failed build can always be retried', () => {
    expect(isBuildRetryable({ status: 'failed', tenantId: 't', updatedAt: minutesAgo(0) }, NOW)).toBe(true)
  })

  test.each(['running', 'queued'] as const)('a %s build that stopped reporting progress can be retried', (status) => {
    expect(isBuildRetryable({ status, tenantId: 't', updatedAt: minutesAgo(10) }, NOW)).toBe(true)
  })

  test.each(['running', 'queued'] as const)('a %s build that is still reporting progress cannot', (status) => {
    expect(isBuildRetryable({ status, tenantId: 't', updatedAt: minutesAgo(2) }, NOW)).toBe(false)
  })

  test('a stale build with no store yet has nothing to build', () => {
    expect(isBuildRetryable({ status: 'queued', tenantId: null, updatedAt: minutesAgo(30) }, NOW)).toBe(false)
  })

  test.each(['ready', 'awaiting_details'] as const)('a %s set-up is never retried', (status) => {
    expect(isBuildRetryable({ status, tenantId: 't', updatedAt: minutesAgo(60) }, NOW)).toBe(false)
  })

  test('an unreadable timestamp is not treated as stale', () => {
    expect(isBuildRetryable({ status: 'running', tenantId: 't', updatedAt: 'not a date' }, NOW)).toBe(false)
  })

  test('the cutoff is STALE_BUILD_MS before now, as ISO', () => {
    expect(staleBuildCutoff(NOW)).toBe(new Date(NOW - STALE_BUILD_MS).toISOString())
  })

  test('a dead build is shown as failed so the retry button appears', () => {
    expect(displayedBuildStatus({ status: 'running', tenantId: 't', updatedAt: minutesAgo(10) }, NOW)).toBe('failed')
    expect(displayedBuildStatus({ status: 'running', tenantId: 't', updatedAt: minutesAgo(1) }, NOW)).toBe('running')
    expect(displayedBuildStatus({ status: 'ready', tenantId: 't', updatedAt: minutesAgo(60) }, NOW)).toBe('ready')
  })
})
