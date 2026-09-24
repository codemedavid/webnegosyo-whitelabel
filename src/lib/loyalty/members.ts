/**
 * Who is on the stamp card, and who is about to win something.
 *
 * Pure — no Supabase, no React — so the merchant app, the web admin and the
 * API all rank the same customers the same way. The I/O that feeds this lives
 * in `member-repository.ts`.
 *
 * The question a merchant actually asks is "who do I call today?", so the
 * ordering is opinionated: a customer holding an unused reward comes first,
 * then whoever is closest to earning one. Dormancy is a SEPARATE flag rather
 * than a status, because "hasn't been in for months AND is one stamp away" is
 * the single most worthwhile call to make, and a status could only say one of
 * those two things.
 */

import type { LoyaltyEarnMode, LoyaltyProgramStatus } from './types'

/** Days without a stamp after which a card is treated as having gone quiet. */
const DORMANT_AFTER_DAYS = 60

/** A customer whose card has never got past this has only just joined. */
const NEW_MAX_LIFETIME = 1

/**
 * How close to the threshold counts as "almost there", as a share of the card.
 * A quarter of a 10-stamp card is the last 3 visits; the floor of 1 keeps the
 * band from emptying on a short card.
 */
const ALMOST_THERE_SHARE = 0.25

export type LoyaltyMemberStatus =
  | 'reward_ready'
  | 'almost_there'
  | 'dormant'
  | 'new'
  | 'earning'

/** One program's row for one customer, straight off the balance table. */
export interface LoyaltyMemberProgramInput {
  programId: string
  programName: string
  programStatus: LoyaltyProgramStatus
  earnMode: LoyaltyEarnMode
  /** Stamps or points one reward costs; 0 when the rules could not be read. */
  threshold: number
  /** The reward in customer language, e.g. "₱200 off". */
  rewardLabel: string
  balance: number
  lifetimeEarned: number
  rewardsIssued: number
  /** Issued rewards that are still claimable. */
  rewardsAvailable: number
  /** When this card last moved. Null when unknown. */
  lastActivityAt: string | null
}

export interface LoyaltyMemberProgress extends LoyaltyMemberProgramInput {
  /** Stamps or points still needed. Null when the threshold is unreadable. */
  remaining: number | null
  /** 0–100 toward the next reward. Null when the threshold is unreadable. */
  percent: number | null
  /** No stamp for {@link DORMANT_AFTER_DAYS}. */
  isDormant: boolean
}

export interface LoyaltyMemberInput {
  customerKey: string
  customerId: string | null
  name: string | null
  programs: LoyaltyMemberProgramInput[]
}

export interface LoyaltyMember {
  customerKey: string
  customerId: string | null
  name: string | null
  phone: string | null
  email: string | null
  programs: LoyaltyMemberProgress[]
  /** The card that decides this member's status — the nearest to a reward. */
  headline: LoyaltyMemberProgress | null
  status: LoyaltyMemberStatus
  isDormant: boolean
  /** Claimable rewards across every program. */
  rewardsAvailable: number
  lastActivityAt: string | null
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** The phone or email hiding inside a `phone:+63…` / `email:…` identity key. */
export function contactFromCustomerKey(customerKey: string): {
  phone: string | null
  email: string | null
} {
  const key = typeof customerKey === 'string' ? customerKey.trim() : ''
  if (key.startsWith('phone:')) return { phone: key.slice('phone:'.length) || null, email: null }
  if (key.startsWith('email:')) return { phone: null, email: key.slice('email:'.length) || null }
  return { phone: null, email: null }
}

/** Progress toward the next reward on one card. */
export function summarizeProgramProgress(
  input: LoyaltyMemberProgramInput,
  nowMs: number
): LoyaltyMemberProgress {
  const threshold = toFiniteNumber(input.threshold)
  const balance = toFiniteNumber(input.balance)

  // An ended program still holds stamps, but without readable rules there is
  // no honest progress to draw. Null says "unknown"; zero would say "ready".
  const hasThreshold = threshold > 0
  const remaining = hasThreshold ? Math.max(0, Math.ceil(threshold - balance)) : null
  const percent = hasThreshold
    ? Math.max(0, Math.min(100, Math.round((balance / threshold) * 100)))
    : null

  const lastMs = input.lastActivityAt ? Date.parse(input.lastActivityAt) : NaN
  const isDormant =
    Number.isFinite(lastMs) && nowMs - lastMs > DORMANT_AFTER_DAYS * 86_400_000

  return { ...input, threshold, balance, remaining, percent, isDormant }
}

/**
 * The one thing to say about this card.
 *
 * Precedence is the order a merchant would act in: a reward waiting to be
 * handed over, then a customer worth nudging, then one who has drifted away,
 * then a newcomer. Everything else is just earning.
 */
export function classifyMemberStatus(progress: LoyaltyMemberProgress): LoyaltyMemberStatus {
  if (progress.rewardsAvailable > 0) return 'reward_ready'

  if (progress.remaining !== null && progress.threshold > 0) {
    const band = Math.max(1, Math.ceil(progress.threshold * ALMOST_THERE_SHARE))
    if (progress.remaining <= band) return 'almost_there'
  }

  if (progress.isDormant) return 'dormant'
  if (progress.lifetimeEarned <= NEW_MAX_LIFETIME) return 'new'
  return 'earning'
}

/** How loudly a status should read. Mapped to real colours by each surface. */
export type LoyaltyMemberTone = 'success' | 'accent' | 'warning' | 'neutral'

const STATUS_COPY: Record<
  LoyaltyMemberStatus,
  { label: string; hint: string; tone: LoyaltyMemberTone }
> = {
  reward_ready: { label: 'Reward ready', hint: 'Has a reward waiting to be used', tone: 'success' },
  almost_there: { label: 'Almost there', hint: 'A few visits from the next reward', tone: 'accent' },
  dormant: { label: 'Gone quiet', hint: 'No visit in a while — worth a nudge', tone: 'warning' },
  new: { label: 'Just joined', hint: 'First visit on the card', tone: 'neutral' },
  earning: { label: 'Collecting', hint: 'Building up stamps', tone: 'neutral' },
}

export function describeMemberStatus(status: LoyaltyMemberStatus): {
  label: string
  hint: string
  tone: LoyaltyMemberTone
} {
  return STATUS_COPY[status] ?? STATUS_COPY.earning
}

/** Lower sorts first: a claimable reward, then whoever is closest. */
function rankOf(member: LoyaltyMember): [number, number, number] {
  const remaining = member.headline?.remaining
  return [
    member.status === 'reward_ready' ? 0 : 1,
    remaining === null || remaining === undefined ? Number.MAX_SAFE_INTEGER : remaining,
    -(member.lastActivityAt ? Date.parse(member.lastActivityAt) || 0 : 0),
  ]
}

export function buildLoyaltyMember(input: LoyaltyMemberInput, nowMs: number): LoyaltyMember {
  const programs = input.programs.map((program) => summarizeProgramProgress(program, nowMs))

  // The headline is whichever card the customer is nearest to claiming, which
  // is also the one a merchant would mention if they only mentioned one.
  const headline =
    programs.length === 0
      ? null
      : [...programs].sort((a, b) => {
          const claimable = Number(b.rewardsAvailable > 0) - Number(a.rewardsAvailable > 0)
          if (claimable !== 0) return claimable
          const left = a.remaining ?? Number.MAX_SAFE_INTEGER
          const right = b.remaining ?? Number.MAX_SAFE_INTEGER
          return left - right
        })[0]

  const rewardsAvailable = programs.reduce((sum, p) => sum + toFiniteNumber(p.rewardsAvailable), 0)

  const activityTimes = programs
    .map((p) => p.lastActivityAt)
    .filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
    .sort()
  const lastActivityAt = activityTimes.length ? activityTimes[activityTimes.length - 1] : null

  const contact = contactFromCustomerKey(input.customerKey)

  return {
    customerKey: input.customerKey,
    customerId: input.customerId,
    name: input.name,
    phone: contact.phone,
    email: contact.email,
    programs,
    headline,
    status: headline ? classifyMemberStatus(headline) : 'new',
    isDormant: headline ? programs.every((p) => p.isDormant) : false,
    rewardsAvailable,
    lastActivityAt,
  }
}

/** Claimable first, then closest to the prize. Never mutates the input. */
export function rankLoyaltyMembers(members: LoyaltyMember[]): LoyaltyMember[] {
  return [...members].sort((a, b) => {
    const left = rankOf(a)
    const right = rankOf(b)
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i]
    }
    return 0
  })
}

export interface LoyaltyMemberTotals {
  total: number
  rewardReady: number
  almostThere: number
  earning: number
  new: number
  dormant: number
  rewardsAvailable: number
}

export function summarizeLoyaltyMembers(members: LoyaltyMember[]): LoyaltyMemberTotals {
  return members.reduce<LoyaltyMemberTotals>(
    (totals, member) => ({
      total: totals.total + 1,
      rewardReady: totals.rewardReady + Number(member.status === 'reward_ready'),
      almostThere: totals.almostThere + Number(member.status === 'almost_there'),
      earning: totals.earning + Number(member.status === 'earning'),
      new: totals.new + Number(member.status === 'new'),
      dormant: totals.dormant + Number(member.status === 'dormant'),
      rewardsAvailable: totals.rewardsAvailable + member.rewardsAvailable,
    }),
    { total: 0, rewardReady: 0, almostThere: 0, earning: 0, new: 0, dormant: 0, rewardsAvailable: 0 }
  )
}
