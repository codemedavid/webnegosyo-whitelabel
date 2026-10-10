/**
 * Launch heroes: real Hero Builder gallery templates, filled for one store.
 *
 * Each entry names a gallery template and how a new store fills it: the
 * words come from `launch-copy.ts` (the design AI's lines, checked, or honest
 * store-type copy), the facts from the owner's answers (hours, order types,
 * payments, best sellers with prices), the pictures from `launch-photos.ts`
 * (stock photos that suit the store type). A template's sample claims
 * ("Rated 4.9", "Est. 2012") never reach a store: every slot is filled.
 *
 * Templates with their own palette (press quote, chalkboard…) also paint the
 * storefront header to match their top band, as the owner did by hand on
 * Karamotan Grill, so header and hero read as one block.
 *
 * Pure: no I/O.
 */

import { buildFullBleedPhoto, buildCafeMinimal, buildSplitPhoto } from '@/lib/hero-builder/templates'
import { CHALKBOARD_BAND, FINE_DINING_BAND, buildCardOnPhoto, buildChalkboard, buildFineDining } from '@/lib/hero-builder/templates-dark'
import { BAKERY_BAND, buildBakery, buildHowItWorks } from '@/lib/hero-builder/templates-light'
import { MASTHEAD_BAND, PRESS_QUOTE_BAND, buildMastheadPanorama, buildPressQuote } from '@/lib/hero-builder/templates-story'
import type { TemplateBand, TemplateCopy, TemplateHighlight } from '@/lib/hero-builder/template-copy'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { OnboardingOrderType } from './answers'
import { plainWords, type LaunchCopy } from './launch-copy'
import { hasStockPhotos, pickLaunchPhotos, type PhotoSlot } from './launch-photos'
import type { StoreType } from './store-type'

export const LAUNCH_HEROES = [
  'press-quote',
  'full-bleed-photo',
  'split-photo',
  'card-on-photo',
  'fine-dining',
  'masthead-panorama',
  'chalkboard',
  'cafe-minimal',
  'bakery',
  'how-it-works',
] as const
export type LaunchHero = (typeof LAUNCH_HEROES)[number]

/** Every store can have this one: no photos, no best sellers needed. */
export const ALWAYS_AVAILABLE_HERO: LaunchHero = 'how-it-works'

export function isLaunchHero(value: unknown): value is LaunchHero {
  return typeof value === 'string' && (LAUNCH_HEROES as readonly string[]).includes(value)
}

export interface LaunchHeroInput {
  storeName: string
  storeType: StoreType
  orderTypes: readonly OnboardingOrderType[]
  /** Display names, e.g. ["GCash", "Cash"]. */
  paymentNames: readonly string[]
  hours: { open: string; close: string; closedDays: readonly number[] }
  /** The owner's best sellers as they are on the menu. */
  favorites: ReadonlyArray<{ name: string; price: number }>
  /** Menu category names; they pick which dish photos lead. */
  menuCategories: readonly string[]
  /** The storefront's button color (`button_primary_color`). */
  buttonColor: string
}

const MIN_FAVORITES = 2
const MAX_FAVORITES = 4
const MAX_NAME = 60
/** The masthead sets the name huge: longer names or words would wrap badly on a phone. */
const MASTHEAD_MAX_NAME = 16
const MASTHEAD_MAX_WORD = 9
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORNAMENT = '✦ ✦ ✦'

const ORDER_WAYS: Record<OnboardingOrderType, { icon: string; label: string; step: string }> = {
  dine_in: { icon: 'UtensilsCrossed', label: 'Dine in', step: 'enjoy it here' },
  pickup: { icon: 'ShoppingBag', label: 'Pickup', step: 'pick it up' },
  delivery: { icon: 'Truck', label: 'Delivery', step: 'get it delivered' },
}

/** Icons for the three menu highlights: the type's own, then two that suit any line. */
const TYPE_ICONS: Record<StoreType, readonly [string, string, string]> = {
  restaurant: ['Utensils', 'Sparkles', 'Heart'],
  cafe: ['Coffee', 'Sparkles', 'Heart'],
  milk_tea: ['CupSoda', 'Sparkles', 'Heart'],
  bakery: ['Croissant', 'Sparkles', 'Heart'],
  other: ['ShoppingBag', 'Sparkles', 'Heart'],
}

// ── Words from the answers ───────────────────────────────────────────────

export function formatClock(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function hoursLine(hours: LaunchHeroInput['hours']): string {
  const open = `${formatClock(hours.open)} – ${formatClock(hours.close)}`
  if (hours.closedDays.length === 0) return `Open daily, ${open}`
  const closed = [...hours.closedDays].sort((a, b) => a - b).flatMap((day) => DAY_NAMES[day] ?? []).join(', ')
  if (!closed) return `Open daily, ${open}`
  return `Open ${open} · Closed ${closed}`
}

/** "GCash, Maya or cash". */
function joinOr(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function peso(amount: number): string {
  return `₱${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

function storeName(input: LaunchHeroInput): string {
  return plainWords(input.storeName).slice(0, MAX_NAME)
}

/** Opening hours, how to order and how to pay: only what the owner told us. */
function factHighlights(input: LaunchHeroInput, max: number): TemplateHighlight[] {
  const ways = input.orderTypes.map((type) => ORDER_WAYS[type])
  const facts: TemplateHighlight[] = [
    { icon: 'Clock', label: hoursLine(input.hours) },
    ...(ways.length > 0 ? [{ icon: ways[0].icon, label: ways.map((way) => way.label).join(' · ') }] : []),
    ...(input.paymentNames.length > 0 ? [{ icon: 'Wallet', label: `Pay with ${joinOr(input.paymentNames)}` }] : []),
  ]
  return facts.slice(0, max)
}

function menuHighlights(input: LaunchHeroInput, copy: LaunchCopy): TemplateHighlight[] {
  const icons = TYPE_ICONS[input.storeType]
  return copy.highlights.map((label, index) => ({ icon: icons[index], label }))
}

function favoriteLines(input: LaunchHeroInput): TemplateHighlight[] {
  return input.favorites
    .filter((item) => item.price > 0)
    .slice(0, MAX_FAVORITES)
    .map((item) => ({ icon: 'Utensils', label: `${plainWords(item.name).slice(0, MAX_NAME)} — ${peso(item.price)}` }))
}

function howItWorksCards(input: LaunchHeroInput): TemplateCopy['cards'] {
  const finish = input.orderTypes.length > 0 ? capitalize(joinOr(input.orderTypes.map((type) => ORDER_WAYS[type].step))) : 'Get your order'
  return [
    { title: 'Pick your favorites', body: 'Browse the menu and add them to your cart.' },
    { title: 'Pay your way', body: input.paymentNames.length > 0 ? `${joinOr(input.paymentNames)}.` : 'Choose how you pay at checkout.' },
    { title: finish, body: 'We get your order ready.' },
  ]
}

// ── Catalog ──────────────────────────────────────────────────────────────

interface FillContext {
  input: LaunchHeroInput
  copy: LaunchCopy
  base: TemplateCopy
}

interface LaunchHeroSpec {
  /** Shown to the design AI only. */
  guide: string
  /** True when the template brings its own colors instead of the store's. */
  hasOwnPalette: boolean
  photos: readonly PhotoSlot[]
  band?: TemplateBand
  fits: (input: LaunchHeroInput) => boolean
  fill: (context: FillContext) => TemplateCopy
  build: (copy: TemplateCopy) => HeroDesignV5
}

const withPhotos = (input: LaunchHeroInput) => hasStockPhotos(input.storeType)
const DISH: PhotoSlot = { kind: 'dish', width: 1600 }
const ROOM: PhotoSlot = { kind: 'room', width: 2000 }

/** The slots every template shares; each spec overrides what its layout shows. */
function baseCopy(context: Pick<FillContext, 'input' | 'copy'>, photos: TemplateCopy['photos']): TemplateCopy {
  return {
    kicker: context.copy.kicker,
    headline: context.copy.headline,
    body: context.copy.body,
    highlights: [],
    primaryCta: context.copy.primaryCta,
    secondaryCta: 'View menu',
    photos,
  }
}

const LAUNCH_HERO_SPECS: Record<LaunchHero, LaunchHeroSpec> = {
  'press-quote': {
    guide: 'one big italic serif line on deep oxblood with gold details, signed with the store name, and a strip of three food photos; warm, confident, great for restaurants and grills',
    hasOwnPalette: true,
    photos: [{ kind: 'dish', width: 800 }, { kind: 'room', width: 800 }, { kind: 'dish', width: 800 }],
    band: PRESS_QUOTE_BAND,
    fits: withPhotos,
    fill: ({ input, base }) => ({ ...base, kicker: ORNAMENT, signature: storeName(input) }),
    build: buildPressQuote,
  },
  'full-bleed-photo': {
    guide: 'a food photo fills the screen under a dark tint, white headline, opening hours and ways to order; bold and appetizing',
    hasOwnPalette: true,
    photos: [ROOM],
    fits: withPhotos,
    fill: ({ input, base }) => ({ ...base, highlights: factHighlights(input, 3) }),
    build: buildFullBleedPhoto,
  },
  'split-photo': {
    guide: 'headline and order buttons beside a big food photo, on the store\'s own background; a clean all-rounder',
    hasOwnPalette: false,
    photos: [DISH],
    fits: withPhotos,
    fill: ({ input, base }) => ({ ...base, highlights: factHighlights(input, 2) }),
    build: buildSplitPhoto,
  },
  'card-on-photo': {
    guide: 'a dining-room photo fills the screen with the pitch on a floating white card; friendly sit-down restaurants',
    hasOwnPalette: false,
    photos: [ROOM],
    fits: (input) => input.storeType === 'restaurant',
    fill: ({ input, base }) => ({ ...base, highlights: factHighlights(input, 2) }),
    build: buildCardOnPhoto,
  },
  'fine-dining': {
    guide: 'full-screen dining-room photo, elegant serif type and gold details; upscale, sit-down, higher prices',
    hasOwnPalette: true,
    photos: [ROOM],
    band: FINE_DINING_BAND,
    fits: (input) => input.storeType === 'restaurant',
    fill: ({ base }) => base,
    build: buildFineDining,
  },
  'masthead-panorama': {
    guide: 'the store name set huge in lowercase serif on bone, a wide photo band, then hours and ways to order; calm and editorial, needs a short name',
    hasOwnPalette: true,
    photos: [{ kind: 'room', width: 2200 }],
    band: MASTHEAD_BAND,
    fits: (input) => {
      const name = storeName(input)
      return withPhotos(input) && name.length > 0 && name.length <= MASTHEAD_MAX_NAME && name.split(' ').every((word) => word.length <= MASTHEAD_MAX_WORD)
    },
    fill: ({ input, base }) => ({ ...base, headline: storeName(input).toLowerCase(), highlights: factHighlights(input, 3) }),
    build: buildMastheadPanorama,
  },
  chalkboard: {
    guide: 'a hand-lettered chalkboard listing their best sellers with real prices, beside a framed food photo; homey, carinderia, specials-driven',
    hasOwnPalette: true,
    photos: [DISH],
    band: CHALKBOARD_BAND,
    fits: (input) => withPhotos(input) && favoriteLines(input).length >= MIN_FAVORITES,
    fill: ({ input, base }) => ({ ...base, kicker: 'Our best sellers', highlights: favoriteLines(input) }),
    build: buildChalkboard,
  },
  'cafe-minimal': {
    guide: 'serif headline, lots of white space, three short highlights and a coffee photo; calm, premium cafés',
    hasOwnPalette: false,
    photos: [DISH],
    fits: (input) => input.storeType === 'cafe' || input.storeType === 'bakery',
    fill: ({ input, copy, base }) => ({ ...base, highlights: menuHighlights(input, copy) }),
    build: buildCafeMinimal,
  },
  bakery: {
    guide: 'warm cream background, a handwritten greeting, three short highlights and a round photo of fresh bakes; bakeries and pastry cafés',
    hasOwnPalette: true,
    photos: [DISH],
    band: BAKERY_BAND,
    fits: (input) => input.storeType === 'bakery' || input.storeType === 'cafe',
    fill: ({ input, copy, base }) => ({ ...base, highlights: menuHighlights(input, copy) }),
    build: buildBakery,
  },
  'how-it-works': {
    guide: 'brand-color gradient with a big headline, then three steps (pick, pay with their real payment methods, get it); no photos, works for any store',
    hasOwnPalette: false,
    photos: [],
    fits: () => true,
    fill: ({ input, base }) => ({ ...base, cards: howItWorksCards(input) }),
    build: buildHowItWorks,
  },
}

export function launchHeroGuide(hero: LaunchHero): string {
  return LAUNCH_HERO_SPECS[hero].guide
}

export function hasOwnPalette(hero: LaunchHero): boolean {
  return LAUNCH_HERO_SPECS[hero].hasOwnPalette
}

/** Which heroes this store can be filled into, in catalog order. */
export function availableLaunchHeroes(input: LaunchHeroInput): LaunchHero[] {
  return LAUNCH_HEROES.filter((hero) => LAUNCH_HERO_SPECS[hero].fits(input))
}

/** The template filled for this store, with the store's button color pinned so its labels stay readable. */
export function buildLaunchHero(hero: LaunchHero, input: LaunchHeroInput, copy: LaunchCopy): HeroDesignV5 {
  const spec = LAUNCH_HERO_SPECS[hero]
  const base = baseCopy({ input, copy }, pickLaunchPhotos(input.storeType, input.menuCategories, spec.photos))
  const design = spec.build(spec.fill({ input, copy, base }))
  return { ...design, theme: { ...design.theme, colors: { ...design.theme.colors, primary: input.buttonColor } } }
}

/** Header colors that join the storefront header to the hero's top band; empty when the hero has none. */
export function launchHeroHeader(hero: LaunchHero): Record<string, string> {
  const band = LAUNCH_HERO_SPECS[hero].band
  if (!band) return {}
  return { header_color: band.background, header_font_color: band.title, menu_main_header_text_color: band.title }
}
