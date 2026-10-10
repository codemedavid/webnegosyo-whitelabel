/**
 * The words on a launch hero: written by the design AI from the store's own
 * menu, checked here, and replaced field by field with honest store-type copy
 * whenever a line is missing, too long or claims something we cannot know.
 *
 * A new store has no reviews, no history and no promises on record, so a line
 * with a number ("Rated 4.9", "Since 2012", "Ready in 30 minutes", "₱500") or
 * a claim word (award, famous, free delivery…) is refused outright. Facts the
 * store DID give us (hours, order types, payments, best sellers and prices)
 * never come from the model: `launch-heroes.ts` writes those from the answers.
 *
 * Pure: no I/O.
 */

import type { StoreType } from './store-type'
import { STORE_TYPES } from './store-type'

export interface LaunchCopy {
  /** Eyebrow / badge, a few words. */
  kicker: string
  headline: string
  /** One sentence about what the store serves. */
  body: string
  /** Three short lines about the menu, for templates that list highlights. */
  highlights: readonly [string, string, string]
  primaryCta: string
}

export const COPY_LIMITS = {
  kicker: 32,
  headline: 72,
  body: 150,
  highlight: 32,
  primaryCta: 16,
} as const

const MIN_HEADLINE = 6
const HIGHLIGHT_COUNT = 3

/**
 * Anything that reads as a fact we were never told. Digits (any script) and
 * number words cover ratings, years, times, prices and counts; the words
 * cover reviews, history, promos, sourcing and cooking claims; delivery and
 * payment words are left to the facts the owner gave us; domains and handles
 * keep the hero from pointing anywhere else.
 */
const UNKNOWABLE_CLAIM = new RegExp(
  [
    String.raw`\p{Nd}|₱|%|#|https?:|www\.|@|\w\.[a-z]{2,}\b`,
    String.raw`\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|dozen|half|double|triple)\b`,
    String.raw`\b(rated|ratings?|reviews?|stars?|awards?|award-winning|famous|legendary|since|est|established|years?|decades?|generations?|minutes?|mins?|hours?|fastest|best[- ]sell(ing|ers?)|number one|michelin|celebrity|certified|world[- ]class|the best|best in)\b`,
    String.raw`\b(free|sale|discount|promo|deals?|bogo|buy one|guaranteed?|cheapest|lowest|unlimited)\b`,
    String.raw`\b(organic|halal|vegan|gluten|all-natural|homemade|home-made|handmade|hand-made|authentic|charcoal|wood-fired|slow-cooked|family recipe|secret recipe|locally sourced|farm|imported)\b`,
    String.raw`\b(deliver(s|y|ed|ing)?|citywide|nationwide|gcash|maya|paymaya|credit card|cash on)\b`,
  ].join('|'),
  'iu',
)

/** Hero text widgets read `*`, `**` and `[..](..)` as markup; copy is plain words. */
export function plainWords(value: string): string {
  return value.replace(/\*/g, '').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim()
}

/** A clean line within `max` characters that claims nothing unknowable, or null. */
export function honestLine(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== 'string') return null
  const line = plainWords(value)
  if (line.length < min || line.length > max) return null
  if (UNKNOWABLE_CLAIM.test(line)) return null
  return line
}

const TYPE_COPY: Record<StoreType, { kicker: string; body: string; highlights: readonly [string, string, string] }> = {
  restaurant: {
    kicker: 'Now taking orders',
    body: 'Browse the menu and order your favorites in a few taps.',
    highlights: ['Cooked when you order', 'Order online in a few taps', 'Pay the way you like'],
  },
  cafe: {
    kicker: 'Order ahead',
    body: 'Browse the menu and order your coffee in a few taps.',
    highlights: ['Made when you order', 'Order ahead online', 'Pay the way you like'],
  },
  milk_tea: {
    kicker: 'Order ahead',
    body: 'Pick your drink, make it yours and order in a few taps.',
    highlights: ['Made the way you like it', 'Order ahead online', 'Pay the way you like'],
  },
  bakery: {
    kicker: 'Fresh from our oven',
    body: 'Browse what we bake and reserve yours in a few taps.',
    highlights: ['Baked fresh', 'Reserve ahead online', 'Pay the way you like'],
  },
  other: {
    kicker: 'Now taking orders',
    body: 'Browse our menu and order in a few taps.',
    highlights: ['Easy online ordering', 'Order ahead', 'Pay the way you like'],
  },
}

export interface FallbackCopyInput {
  storeName: string
  storeType: StoreType
  /** The owner's own line; used as the body when it passes the same checks. */
  tagline?: string | null
}

/** Honest copy for any store, used field by field when the AI's line fails. */
export function fallbackLaunchCopy(input: FallbackCopyInput): LaunchCopy {
  const type = TYPE_COPY[input.storeType]
  const name = plainWords(input.storeName).slice(0, COPY_LIMITS.headline)
  return {
    kicker: honestLine(STORE_TYPES[input.storeType].heroLine, COPY_LIMITS.kicker) ?? type.kicker,
    headline: name || type.kicker,
    body: honestLine(input.tagline, COPY_LIMITS.body) ?? type.body,
    highlights: type.highlights,
    primaryCta: 'Order now',
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * The AI's copy where each line passes, the fallback where it does not.
 * `usedAi` is true when the headline is the AI's (the line people read).
 */
export function cleanLaunchCopy(raw: unknown, fallback: LaunchCopy): { copy: LaunchCopy; usedAi: boolean } {
  const ai = asRecord(raw)
  const headline = honestLine(ai.headline, COPY_LIMITS.headline, MIN_HEADLINE)
  const aiHighlights = (Array.isArray(ai.highlights) ? ai.highlights : [])
    .map((line) => honestLine(line, COPY_LIMITS.highlight))
    .filter((line): line is string => line !== null)
  const highlights = aiHighlights.length >= HIGHLIGHT_COUNT
    ? ([aiHighlights[0], aiHighlights[1], aiHighlights[2]] as const)
    : fallback.highlights
  return {
    copy: {
      kicker: honestLine(ai.kicker, COPY_LIMITS.kicker) ?? fallback.kicker,
      headline: headline ?? fallback.headline,
      body: honestLine(ai.body, COPY_LIMITS.body) ?? fallback.body,
      highlights,
      primaryCta: honestLine(ai.primaryCta, COPY_LIMITS.primaryCta) ?? fallback.primaryCta,
    },
    usedAi: headline !== null,
  }
}
