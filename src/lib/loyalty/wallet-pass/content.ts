/**
 * What a member's wallet card says, independent of Apple or Google.
 *
 * Pure: the caller reads the ledger and the store, this decides the words and
 * colours. Both wallet formats are rendered from this one shape, so an Apple
 * pass and a Google pass for the same member can never disagree, and the hash
 * of this shape is what decides whether a device needs to be told to refresh.
 *
 * It carries the member code (a random serial), never the phone number the
 * ledger keys on.
 */

import { createHash } from 'node:crypto'
import { rewardSteps } from '../ladder'
import { describeLoyaltyReward } from '../offer'
import { nextRewardStep } from '../ladder'
import type { LoyaltyEarnMode, LoyaltyProgram } from '../types'
import { encodeMemberCode } from './member-code'

const FALLBACK_BACKGROUND = '#1F2937'
const LIGHT_TEXT = '#FFFFFF'
const DARK_TEXT = '#111111'
/** WCAG AA for large text — card values are large and bold. */
const MIN_CONTRAST = 3
/** Above this many slots a stamp grid stops reading (same limit as the tracking page). */
export const MAX_STAMP_GRID_SLOTS = 12

export type WalletProgramStatus = 'active' | 'paused' | 'ended'

export interface WalletPassContentInput {
  serial: string
  storeName: string
  logoUrl: string | null
  storeUrl: string | null
  /** The store's button colours: the card is painted like its primary button. */
  colors: { background: string; text: string }
  program: LoyaltyProgram
  /** Stamps/points toward the next reward; null when the member has no row yet. */
  balance: number | null
  /** Expiry of each reward the member holds (null = never expires). */
  rewardExpiries: ReadonlyArray<string | null>
  nowMs: number
}

/** The punch grid drawn on the pass; slot numbers are 1-based. */
export interface WalletStampCard {
  filled: number
  total: number
  rewardSlots: number[]
}

export interface WalletPassContent {
  serial: string
  memberCode: string
  storeName: string
  programName: string
  description: string
  logoUrl: string | null
  storeUrl: string | null
  colors: { background: string; foreground: string }
  earnMode: LoyaltyEarnMode
  balanceLabel: string
  balanceText: string
  remainingText: string
  rewardLabel: string
  rewardsAvailable: number
  nextRewardExpiresAt: string | null
  headline: { label: string; value: string }
  /** "Collect 10 stamps, get ₱200 off". */
  offerText: string
  /** Null for points programmes and cards too long to draw as a grid. */
  stampCard: WalletStampCard | null
  programStatus: WalletProgramStatus
  statusNote: string | null
}

function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim())
  if (!match) return null
  const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1]
  return `#${hex.toUpperCase()}`
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

function resolveColors(colors: WalletPassContentInput['colors']): WalletPassContent['colors'] {
  const background = normalizeHex(colors.background) ?? FALLBACK_BACKGROUND
  const preferred = normalizeHex(colors.text)
  if (preferred && contrast(background, preferred) >= MIN_CONTRAST) return { background, foreground: preferred }
  const foreground = contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
  return { background, foreground }
}

function httpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function formatAmount(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function unitWord(mode: LoyaltyEarnMode, count: number): string {
  const singular = mode === 'stamp' ? 'stamp' : 'point'
  return count === 1 ? singular : `${singular}s`
}

function resolveStatus(program: LoyaltyProgram, nowMs: number): WalletProgramStatus {
  const endsMs = program.endsAt ? Date.parse(program.endsAt) : NaN
  if (program.status === 'ended' || (Number.isFinite(endsMs) && endsMs <= nowMs)) return 'ended'
  return program.status === 'active' ? 'active' : 'paused'
}

function statusNoteFor(status: WalletProgramStatus, mode: LoyaltyEarnMode): string | null {
  const unit = unitWord(mode, 2)
  if (status === 'ended') {
    return `This programme is no longer collecting ${unit}. Rewards you already earned stay valid until they expire.`
  }
  if (status === 'paused') return `Collecting ${unit} is paused for now. Rewards you already earned are still yours.`
  return null
}

/** Unexpired rewards, soonest-expiring first; a reward with no expiry sorts last. */
function liveRewardExpiries(expiries: ReadonlyArray<string | null>, nowMs: number): Array<number | null> {
  return expiries
    .map((value) => (value === null ? null : Date.parse(value)))
    .filter((ms) => ms === null || (Number.isFinite(ms) && ms > nowMs))
    .sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
}

/** A ladder's ready rewards differ, so they are counted rather than named. */
function readyValue(count: number, rewardLabel: string, hasLadder: boolean): string {
  if (hasLadder) return count === 1 ? '1 reward' : `${count} rewards`
  return count === 1 ? rewardLabel : `${count} × ${rewardLabel}`
}

function stampCardFor(rules: LoyaltyProgram['version']['rules'], balance: number): WalletStampCard | null {
  if (rules.earnMode !== 'stamp' || rules.threshold > MAX_STAMP_GRID_SLOTS) return null
  return {
    filled: Math.min(Math.floor(balance), rules.threshold),
    total: rules.threshold,
    rewardSlots: rewardSteps(rules).map((step) => step.at),
  }
}

export function buildWalletPassContent(input: WalletPassContentInput): WalletPassContent {
  const { rules } = input.program.version
  const balance = Number.isFinite(input.balance) ? Math.max(Number(input.balance), 0) : 0
  const rewardLabel = describeLoyaltyReward(rules.reward)
  // On a reward ladder the card talks about the NEXT rung, not the top one.
  const hasLadder = (rules.milestones?.length ?? 0) > 0
  const next = nextRewardStep(rules, balance)
  const remaining = next ? next.remaining : Math.max(rules.threshold - balance, 0)
  const nextLabel = next?.step.label ?? rewardLabel
  const rewards = liveRewardExpiries(input.rewardExpiries, input.nowMs)
  const nextExpiry = rewards[0] ?? null
  const programStatus = resolveStatus(input.program, input.nowMs)

  const headline = rewards.length > 0
    ? { label: 'REWARDS READY', value: readyValue(rewards.length, rewardLabel, hasLadder) }
    : { label: 'NEXT REWARD', value: nextLabel }

  return {
    serial: input.serial,
    memberCode: encodeMemberCode(input.serial),
    storeName: input.storeName,
    programName: input.program.name,
    description: `${input.storeName} loyalty card`,
    logoUrl: httpsUrl(input.logoUrl),
    storeUrl: httpsUrl(input.storeUrl),
    colors: resolveColors(input.colors),
    earnMode: rules.earnMode,
    balanceLabel: rules.earnMode === 'stamp' ? 'STAMPS' : 'POINTS',
    balanceText: `${formatAmount(balance)} / ${formatAmount(rules.threshold)}`,
    remainingText: remaining > 0
      ? `${formatAmount(remaining)} more ${unitWord(rules.earnMode, remaining)}`
      : 'Reward unlocked',
    rewardLabel,
    rewardsAvailable: rewards.length,
    nextRewardExpiresAt: nextExpiry === null ? null : new Date(nextExpiry).toISOString(),
    headline,
    offerText: `Collect ${formatAmount(rules.threshold)} ${unitWord(rules.earnMode, rules.threshold)}, get ${rewardLabel}`,
    stampCard: stampCardFor(rules, balance),
    programStatus,
    statusNote: statusNoteFor(programStatus, rules.earnMode),
  }
}

/** Stable fingerprint of what the card shows; equal hashes mean no device needs a refresh. */
export function hashWalletPassContent(content: WalletPassContent): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]),
      )
    }
    return value
  }
  return createHash('sha256').update(JSON.stringify(stable(content))).digest('hex')
}
