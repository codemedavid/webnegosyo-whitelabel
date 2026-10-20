/**
 * Who a campaign texts: the five chips (same numbers as the merchant app's
 * AUDIENCE_SEGMENTS, so a campaign reads the same on both), the hand-made
 * "Custom", and the words for who gets skipped. Pure.
 */

import type { AudienceFilter, AudiencePreset, SkippedReason } from '../types'

export type SegmentId = Exclude<AudiencePreset, 'custom'>

export interface AudienceSegment {
  id: SegmentId
  title: string
  description: string
  filter: AudienceFilter
}

const LAPSED_DAYS = 21
const REGULAR_MIN_ORDERS = 3
const RECENT_DAYS = 30

export const AUDIENCE_SEGMENTS: readonly AudienceSegment[] = [
  { id: 'everyone', title: 'Everyone', description: 'Every guest who agreed to texts', filter: {} },
  { id: 'lapsed', title: "Haven't been back", description: `No order in ${LAPSED_DAYS}+ days`, filter: { lastOrderOlderThanDays: LAPSED_DAYS } },
  { id: 'regulars', title: 'Regulars', description: `${REGULAR_MIN_ORDERS}+ orders so far`, filter: { minOrderCount: REGULAR_MIN_ORDERS } },
  { id: 'first_timers', title: 'First-timers', description: 'Ordered exactly once', filter: { minOrderCount: 1, maxOrderCount: 1 } },
  { id: 'recent', title: 'Recent guests', description: `Ordered in the last ${RECENT_DAYS} days`, filter: { lastOrderWithinDays: RECENT_DAYS } },
]

const FILTER_KEYS = ['lastOrderOlderThanDays', 'lastOrderWithinDays', 'minOrderCount', 'maxOrderCount', 'minTotalSpent'] as const

export function filterForPreset(preset: AudiencePreset): AudienceFilter {
  const segment = AUDIENCE_SEGMENTS.find((s) => s.id === preset)
  return segment ? { ...segment.filter } : {}
}

function sameFilter(a: AudienceFilter, b: AudienceFilter): boolean {
  if ((a.channels?.length ?? 0) > 0 || (b.channels?.length ?? 0) > 0) return false
  return FILTER_KEYS.every((key) => a[key] === b[key])
}

export function presetForFilter(filter: AudienceFilter): AudiencePreset {
  return AUDIENCE_SEGMENTS.find((s) => sameFilter(filter, s.filter))?.id ?? 'custom'
}

/** Picking a chip replaces the whole filter: custom fields reset. */
export function applySegment(id: SegmentId): AudienceFilter {
  return filterForPreset(id)
}

export function presetTitle(preset: AudiencePreset): string {
  return AUDIENCE_SEGMENTS.find((s) => s.id === preset)?.title ?? 'Custom'
}

function guests(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'guest' : 'guests'}`
}

export function audienceCountText(reach: number): string {
  return `${guests(reach)} will get this`
}

function skippedLine(reason: SkippedReason, count: number, guestCapDays: number): string {
  const n = count.toLocaleString('en-US')
  switch (reason) {
    case 'no_consent': return `${n} haven't agreed to texts`
    case 'recently_texted': return `${n} got a text in the last ${guestCapDays === 1 ? 'day' : `${guestCapDays} days`}`
    case 'opted_out': return `${n} opted out`
    case 'no_phone': return `${n} ${count === 1 ? 'has' : 'have'} no phone number`
    case 'suppressed': return `${n} ${count === 1 ? 'has' : 'have'} a blocked number`
    case 'cannot_fill': return `${n} ${count === 1 ? 'is' : 'are'} missing a detail the message uses`
    case 'over_ceiling': return `${n} over the most one send can reach`
  }
}

/** "31 haven't agreed to texts", biggest first. */
export function skippedLines(skipped: Partial<Record<SkippedReason, number>>, guestCapDays: number): string[] {
  return (Object.entries(skipped) as [SkippedReason, number | undefined][])
    .filter((entry): entry is [SkippedReason, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => skippedLine(reason, count, guestCapDays))
}

export function skippedTotal(skipped: Partial<Record<SkippedReason, number>>): number {
  return Object.values(skipped).reduce<number>((sum, n) => sum + (n ?? 0), 0)
}

/** The one reason nobody would get it. */
export function zeroReachReason(skipped: Partial<Record<SkippedReason, number>>): { text: string; linksToCustomers: boolean } {
  const top = (Object.entries(skipped) as [SkippedReason, number][]).sort((a, b) => b[1] - a[1])[0]
  if (top && top[0] === 'no_consent') {
    return {
      text: 'None of your guests have agreed to texts. Guests agree at checkout, or you can mark it in Customers.',
      linksToCustomers: true,
    }
  }
  if (top && top[0] === 'recently_texted') {
    return { text: 'Everyone who matches got a text in the last few days. Try again later.', linksToCustomers: false }
  }
  return { text: 'Nobody matches who you picked. Try a wider group.', linksToCustomers: false }
}

/** One line for a hand-made audience, e.g. "2+ orders · no order in 14+ days". */
export function describeCustomAudience(filter: AudienceFilter): string {
  const parts = [
    filter.minOrderCount !== undefined ? `${filter.minOrderCount}+ orders` : null,
    filter.maxOrderCount !== undefined ? `at most ${filter.maxOrderCount} ${filter.maxOrderCount === 1 ? 'order' : 'orders'}` : null,
    filter.lastOrderOlderThanDays !== undefined ? `no order in ${filter.lastOrderOlderThanDays}+ days` : null,
    filter.lastOrderWithinDays !== undefined ? `ordered in the last ${filter.lastOrderWithinDays} days` : null,
    filter.minTotalSpent !== undefined ? `spent ₱${filter.minTotalSpent.toLocaleString('en-PH')}+` : null,
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return 'Your own filter'
  const line = parts.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}
