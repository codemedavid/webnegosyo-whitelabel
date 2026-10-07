/**
 * When may a build be started again?
 *
 * The build runs in `after()` under the route's `maxDuration` (300s). If the
 * function is killed or the process dies, nothing moves the row out of
 * `queued`/`running`. A live build touches the row (step progress) at least
 * once per step, so a row that has not been touched for longer than the whole
 * function may live is dead and can be taken over. Pure, so the rule is tested.
 */

import type { OnboardingStatus } from './repository'

/** Longer than the route's 300s maxDuration, so a live build is never taken over. */
export const STALE_BUILD_MS = 6 * 60 * 1000

export interface BuildLiveness {
  status: OnboardingStatus
  tenantId: string | null
  /** The row's `updated_at` (bumped by trigger on every write). */
  updatedAt: string
}

const IN_FLIGHT_STATUSES: ReadonlySet<OnboardingStatus> = new Set(['queued', 'running'])

/** ISO instant before which an in-flight build is considered dead. */
export function staleBuildCutoff(nowMs: number): string {
  return new Date(nowMs - STALE_BUILD_MS).toISOString()
}

function isStaleInFlight(build: BuildLiveness, nowMs: number): boolean {
  if (!IN_FLIGHT_STATUSES.has(build.status) || !build.tenantId) return false
  const touchedAt = Date.parse(build.updatedAt)
  return Number.isFinite(touchedAt) && nowMs - touchedAt > STALE_BUILD_MS
}

/** A failed build, or one that died mid-run (and has a store to build). */
export function isBuildRetryable(build: BuildLiveness, nowMs: number = Date.now()): boolean {
  return build.status === 'failed' || isStaleInFlight(build, nowMs)
}

/** What the buyer and staff are shown: a dead build reads as failed, so a retry is offered. */
export function displayedBuildStatus(build: BuildLiveness, nowMs: number = Date.now()): OnboardingStatus {
  return isStaleInFlight(build, nowMs) ? 'failed' : build.status
}
