/**
 * What kind of store a new merchant runs, and the launch design it implies.
 *
 * Onboarding asks one question — "what do you sell?" — instead of walking a
 * merchant through forty branding fields. The answer picks a card template,
 * page layout, font pairing and hero line; the logo's color (or the type's
 * default) becomes the full coordinated palette. Everything stays editable in
 * Branding Studio afterwards.
 *
 * Pure: no I/O. The result is a `BrandingPatchInput`, so it goes through the
 * same `saveBrandingWithClient` writer as every other branding change.
 */

import { generatePaletteFromColor } from '@/lib/branding-registry'
import type { BrandingPatchInput } from '@/lib/branding-service'
import type { CardTemplate } from '@/lib/card-templates'
import type { PageLayout } from '@/lib/page-layouts'
import type { HeroPreset } from '@/lib/storefront-theme'

type FontPair = 'theme' | 'elegant serif' | 'bold display' | 'modern sans' | 'warm editorial'

interface DesignPick {
  card: CardTemplate
  layout: PageLayout
}

export interface StoreTypeDefinition {
  label: string
  emoji: string
  /** Brand color used when the logo has no usable color. Lowercase `#rrggbb`. */
  defaultColor: string
  /** Hero subtitle when the merchant gave no tagline. */
  heroLine: string
  fontPair: FontPair
  /** Starting look while the menu has no dish photos. */
  look: StoreLook
  /** Design when the menu has item photos. */
  photo: DesignPick
}

/**
 * Looks for a menu without dish photos (every onboarded menu starts that way).
 * Each pairs a card, a page layout and a TEXT hero: a hero that draws a
 * picture panel shows a giant initial when there is no photo. The owner picks
 * one in the wizard; otherwise the store type's own look applies. Chosen by
 * rendering every candidate on real photo-less stores (2026-10-08).
 */
export const STORE_LOOKS = {
  board: {
    label: 'Menu board',
    description: 'Like a printed menu: dish, dotted line, price.',
    card: 'menuboard', layout: 'default', hero: 'editorial',
  },
  chapters: {
    label: 'Chapters',
    description: 'Each category opens on a page in your color.',
    card: 'menuboard', layout: 'lookbook', hero: 'editorial',
  },
  tiles: {
    label: 'Quick order',
    description: 'Big category tiles up top, made for fast picks.',
    card: 'atelier', layout: 'kiosk', hero: 'banner',
  },
  cards: {
    label: 'Cards',
    description: 'Every dish on its own card.',
    card: 'elegant', layout: 'default', hero: 'minimal',
  },
} as const satisfies Record<string, { label: string; description: string; card: CardTemplate; layout: PageLayout; hero: HeroPreset }>

export type StoreLook = keyof typeof STORE_LOOKS

export function isStoreLook(value: unknown): value is StoreLook {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STORE_LOOKS, value)
}

export const STORE_TYPES = {
  restaurant: {
    label: 'Restaurant',
    emoji: '🍽️',
    defaultColor: '#c0392b',
    heroLine: 'Freshly cooked, made to order',
    fontPair: 'modern sans',
    look: 'board',
    photo: { card: 'bistro', layout: 'default' },
  },
  cafe: {
    label: 'Café',
    emoji: '☕',
    defaultColor: '#7b4a2d',
    heroLine: 'Freshly brewed, made to order',
    fontPair: 'elegant serif',
    look: 'chapters',
    photo: { card: 'arch', layout: 'rails' },
  },
  milk_tea: {
    label: 'Milk tea',
    emoji: '🧋',
    defaultColor: '#7c4dbd',
    heroLine: 'Shaken fresh, just the way you like it',
    fontPair: 'bold display',
    look: 'tiles',
    photo: { card: 'showcase', layout: 'rails' },
  },
  bakery: {
    label: 'Bakery',
    emoji: '🥐',
    defaultColor: '#a4643c',
    heroLine: 'Baked fresh every day',
    fontPair: 'warm editorial',
    look: 'cards',
    photo: { card: 'atelier', layout: 'default' },
  },
  other: {
    label: 'Other',
    emoji: '🛍️',
    defaultColor: '#2a6fdb',
    heroLine: 'Order online in a few taps',
    fontPair: 'theme',
    look: 'board',
    photo: { card: 'showcase', layout: 'default' },
  },
} as const satisfies Record<string, StoreTypeDefinition>

export type StoreType = keyof typeof STORE_TYPES

export function isStoreType(value: unknown): value is StoreType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STORE_TYPES, value)
}

export interface LaunchBrandingInput {
  storeType: StoreType
  storeName: string
  /** From the logo; null or malformed falls back to the type's default. */
  brandColor: string | null
  hasItemPhotos: boolean
  tagline?: string | null
  /** The owner's pick in the wizard; absent = the store type's look. */
  look?: StoreLook | null
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const CARD_BACKGROUND = '#ffffff'
const LIGHT_INK = '#ffffff'
const DARK_INK = '#111111'
/** WCAG AA for normal text: button labels. */
const MIN_TEXT_CONTRAST = 4.5
/** WCAG AA for large/bold text: the card price. */
const MIN_PRICE_CONTRAST = 3
/** Each darkening step mixes this much black into a too-mid button color. */
const DARKEN_STEP = 0.08
const MAX_DARKEN_STEPS = 12
/** brandingPatchSchema limits. */
const MAX_HERO_TITLE = 200
const MAX_HERO_DESCRIPTION = 1000

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function relativeLuminance(hex: string): number {
  const linear = channels(hex).map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

function darken(hex: string, amount: number): string {
  return `#${channels(hex)
    .map((value) => Math.round(value * (1 - amount)).toString(16).padStart(2, '0'))
    .join('')}`
}

/** The more readable of light or dark ink on `background`. */
function inkFor(background: string): string {
  return contrastRatio(background, LIGHT_INK) >= contrastRatio(background, DARK_INK) ? LIGHT_INK : DARK_INK
}

/**
 * A button color close to the brand whose label is readable. Mid-tone brands
 * fail with both inks, so they are darkened step by step until white passes.
 */
function readableButton(brand: string): { color: string; ink: string } {
  const ink = inkFor(brand)
  if (contrastRatio(brand, ink) >= MIN_TEXT_CONTRAST) return { color: brand, ink }
  for (let step = 1; step <= MAX_DARKEN_STEPS; step++) {
    const color = darken(brand, DARKEN_STEP * step)
    if (contrastRatio(color, LIGHT_INK) >= MIN_TEXT_CONTRAST) return { color, ink: LIGHT_INK }
  }
  return { color: DARK_INK, ink: LIGHT_INK }
}

function resolveBrandColor(storeType: StoreType, brandColor: string | null): string {
  const candidate = brandColor?.trim() ?? ''
  return (HEX_COLOR.test(candidate) ? candidate : STORE_TYPES[storeType].defaultColor).toLowerCase()
}

/**
 * The branding a freshly onboarded store launches with: a coordinated palette
 * from one color, a design suited to what it sells, and a hero naming it.
 */
export function buildLaunchBranding(input: LaunchBrandingInput): BrandingPatchInput {
  const type = STORE_TYPES[input.storeType]
  const brand = resolveBrandColor(input.storeType, input.brandColor)
  const palette = generatePaletteFromColor(brand)
  const look = STORE_LOOKS[input.look && isStoreLook(input.look) ? input.look : type.look]
  const design = input.hasItemPhotos ? { ...type.photo, hero: 'theme' as const } : look
  const button = readableButton(brand)
  // A pale brand color vanishes as price text on a white card.
  const priceColor = contrastRatio(brand, CARD_BACKGROUND) >= MIN_PRICE_CONTRAST ? brand : palette.primary_color
  const tagline = input.tagline?.trim()

  return {
    ...palette,
    accent_color: brand,
    brand_color: brand,
    secondary_color: palette.text_secondary_color,
    button_primary_color: button.color,
    button_primary_text_color: button.ink,
    cards_color: CARD_BACKGROUND,
    card_title_color: palette.text_primary_color,
    card_price_color: priceColor,
    link_color: priceColor,
    card_template: design.card,
    page_layout: design.layout,
    font_pair: type.fontPair,
    hero_preset: design.hero,
    hero_title: input.storeName.trim().slice(0, MAX_HERO_TITLE),
    hero_description: (tagline || type.heroLine).slice(0, MAX_HERO_DESCRIPTION),
  }
}
