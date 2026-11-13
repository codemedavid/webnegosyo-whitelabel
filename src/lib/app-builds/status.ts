/**
 * A store-app build's life (pure; the database enforces the same order with
 * the `tenant_app_builds_forward_only` trigger):
 *
 *   queued ──(CI fetched its manifest)──▶ preparing ──(EAS build started)──▶ building
 *      └──────────────┬──────────────────────┴──────────────────────────────────┘
 *                     ▼
 *        finished | errored | cancelled   (terminal: never reopened)
 *
 * `submit_status` runs beside it once a build finishes: none → submitting →
 * submitted | submit_failed.
 */

export const BUILD_PLATFORMS = ['ios', 'android'] as const
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number]

export const BUILD_STATUSES = ['queued', 'preparing', 'building', 'finished', 'errored', 'cancelled'] as const
export type BuildStatus = (typeof BUILD_STATUSES)[number]

export const OPEN_BUILD_STATUSES = ['queued', 'preparing', 'building'] as const satisfies readonly BuildStatus[]
export const TERMINAL_BUILD_STATUSES = ['finished', 'errored', 'cancelled'] as const satisfies readonly BuildStatus[]

export const SUBMIT_STATUSES = ['none', 'submitting', 'submitted', 'submit_failed'] as const
export type SubmitStatus = (typeof SUBMIT_STATUSES)[number]

const RANK: Record<BuildStatus, number> = { queued: 0, preparing: 1, building: 2, finished: 3, errored: 3, cancelled: 3 }

export function isBuildStatus(value: unknown): value is BuildStatus {
  return typeof value === 'string' && (BUILD_STATUSES as readonly string[]).includes(value)
}

export function isOpenStatus(status: BuildStatus): boolean {
  return RANK[status] < 3
}

/** Mirrors the trigger: forward only, and a terminal status never changes. */
export function canMove(from: BuildStatus, to: BuildStatus): boolean {
  if (from === to) return true
  if (RANK[from] === 3) return false
  return RANK[to] > RANK[from]
}

/** The workflow must fetch its manifest within this long, or the build "didn't start". */
export const START_GRACE_MS = 30 * 60 * 1000
/** An EAS build that has said nothing for this long is given up on (EAS queues can be slow). */
export const BUILDING_GRACE_MS = 12 * 60 * 60 * 1000
/** How long a build token works: covers a slow runner queue, not a replay days later. */
export const BUILD_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

export interface StaleCheckInput {
  status: BuildStatus
  /** When the build entered its current status (`updated_at`). */
  updatedAt: string
}

/**
 * Why an open build counts as stuck, or null. A stuck build is closed as
 * errored before a new one starts, so one lost CI run can't block an app.
 */
export function staleReason(build: StaleCheckInput, now: Date): string | null {
  const age = now.getTime() - new Date(build.updatedAt).getTime()
  if (!Number.isFinite(age)) return null
  if ((build.status === 'queued' || build.status === 'preparing') && age > START_GRACE_MS) {
    return 'The build didn’t start: the build workflow never reported back.'
  }
  if (build.status === 'building' && age > BUILDING_GRACE_MS) {
    return 'No word from EAS for 12 hours, so this build was given up on.'
  }
  return null
}

/** EAS's own build statuses (webhook `status`) → ours. Only completions arrive by webhook. */
export function statusFromEas(easStatus: unknown): BuildStatus | null {
  switch (easStatus) {
    case 'finished':
      return 'finished'
    case 'errored':
      return 'errored'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return null
  }
}

export const PLATFORM_LABEL: Record<BuildPlatform, string> = { ios: 'iOS', android: 'Android' }
