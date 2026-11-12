import type { AppColors, AppLoyaltyActivity, AppLoyaltyProgram } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'

type EarnMode = AppLoyaltyProgram['earnMode']
type ActivityKind = AppLoyaltyActivity['kind']

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SOON_DAYS = 7
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const unitWord = (mode: EarnMode, count: number) =>
  `${mode === 'points' ? 'point' : 'stamp'}${Math.abs(count) === 1 ? '' : 's'}`

/**
 * "+1 stamp", "−10 stamps" (a true minus sign, so it lines up with the plus).
 * Empty for 0: a reward unlocking moves no stamps on its own ledger row, and
 * "0 stamps" beside "₱50 off unlocked" reads as a mistake.
 */
export function formatDelta(delta: number, mode: EarnMode): string {
  if (delta === 0) return ''
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${Math.abs(delta)} ${unitWord(mode, delta)}`
}

export function activityTone(kind: ActivityKind): keyof AppColors {
  switch (kind) {
    case 'earn':
      return 'success'
    case 'reward_issued':
      return 'primary'
    case 'redeem':
      return 'text'
    case 'reverse':
    case 'reward_expired':
      return 'danger'
    case 'correction':
      return 'textMuted'
  }
}

/** The calendar day in Manila (no DST), as a whole-day number. */
const manilaDay = (date: Date) => Math.floor((date.getTime() + MANILA_OFFSET_MS) / DAY_MS)

function manilaDateLabel(date: Date, now: Date): string {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS)
  const label = `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]}`
  const sameYear = shifted.getUTCFullYear() === new Date(now.getTime() + MANILA_OFFSET_MS).getUTCFullYear()
  return sameYear ? label : `${label} ${shifted.getUTCFullYear()}`
}

export function formatActivityDate(iso: string, now: Date): string {
  const date = new Date(iso)
  const daysAgo = manilaDay(now) - manilaDay(date)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return manilaDateLabel(date, now)
}

export function formatExpiry(iso: string | null, now: Date): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (date.getTime() < now.getTime()) return 'Expired'
  const daysLeft = manilaDay(date) - manilaDay(now)
  if (daysLeft === 0) return 'Expires today'
  if (daysLeft === 1) return 'Expires tomorrow'
  if (daysLeft <= SOON_DAYS) return `Expires in ${daysLeft} days`
  return `Expires ${manilaDateLabel(date, now)}`
}

/** Plain-language rules for the "How it works" card, built only from what the program says. */
export function howItWorks(program: AppLoyaltyProgram): string[] {
  const isPoints = program.earnMode === 'points'
  const minimum = program.minSpend ? ` of ${formatPeso(toCentavos(program.minSpend))} or more` : ''
  const earn = isPoints ? `Earn points on every order${minimum}.` : `Earn 1 stamp on every order${minimum}.`
  return [
    earn,
    `Collect ${program.threshold} ${unitWord(program.earnMode, program.threshold)} to get ${program.rewardLabel}.`,
    `${isPoints ? 'Points' : 'Stamps'} land once your order is completed.`,
    ...(program.branchName ? [`Counts at ${program.branchName} only.`] : []),
  ]
}
