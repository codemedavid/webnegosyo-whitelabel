/**
 * Storefront theme presets — the design-system "knobs" a merchant picks once
 * and that cascade across the whole storefront: a font pairing, a corner
 * roundness, and an accent/brand color.
 *
 * These complement the existing per-field branding system. Each knob has a
 * `'theme'` sentinel meaning "inherit the tenant's existing default" so turning
 * a knob on is purely additive — an unset knob changes nothing.
 *
 * Values mirror the reference storefront design (Restaurant Storefront.dc.html).
 */

export type FontPair =
  | 'theme'
  | 'elegant serif'
  | 'bold display'
  | 'modern sans'
  | 'warm editorial'

export type CardRoundness = 'theme' | 'sharp' | 'soft' | 'round'

export interface FontPairDefinition {
  heading: string
  headingWeight: number
  body: string
}

/** Concrete font pairings (excludes the `'theme'` inherit sentinel). */
export const FONT_PAIRS: Record<Exclude<FontPair, 'theme'>, FontPairDefinition> = {
  'elegant serif': {
    heading: "'Cormorant Garamond', serif",
    headingWeight: 600,
    body: "'Archivo', sans-serif",
  },
  'bold display': {
    heading: "'Anton', sans-serif",
    headingWeight: 400,
    body: "'Archivo', sans-serif",
  },
  'modern sans': {
    heading: "'Archivo', sans-serif",
    headingWeight: 900,
    body: "'Archivo', sans-serif",
  },
  'warm editorial': {
    heading: "'Lora', serif",
    headingWeight: 500,
    body: "'Karla', sans-serif",
  },
}

/** Corner radius in pixels per preset (excludes the `'theme'` inherit sentinel). */
export const ROUNDNESS_PRESETS: Record<Exclude<CardRoundness, 'theme'>, number> = {
  sharp: 0,
  soft: 10,
  round: 22,
}

/** Suggested accent swatches shown in the branding editor color picker. */
export const BRAND_COLOR_PRESETS: readonly string[] = [
  '#E4572E',
  '#C69A5D',
  '#D7263D',
  '#A4643C',
  '#2A6F4E',
]

/** Selectable font-pair options — `'theme'` leads as the default choice. */
export const FONT_PAIR_OPTIONS: readonly FontPair[] = [
  'theme',
  ...(Object.keys(FONT_PAIRS) as Exclude<FontPair, 'theme'>[]),
]

/** Selectable roundness options — `'theme'` leads as the default choice. */
export const ROUNDNESS_OPTIONS: readonly CardRoundness[] = [
  'theme',
  ...(Object.keys(ROUNDNESS_PRESETS) as Exclude<CardRoundness, 'theme'>[]),
]

/**
 * Resolve a font-pair value into its font definition.
 * Returns `null` for the `'theme'` sentinel, unknown names, or non-string
 * input — callers treat `null` as "keep the tenant's existing fonts".
 */
export function resolveFontPair(value: unknown): FontPairDefinition | null {
  if (typeof value !== 'string' || value === 'theme') return null
  return FONT_PAIRS[value as Exclude<FontPair, 'theme'>] ?? null
}

/**
 * Resolve a roundness value into a pixel radius.
 * Returns `null` for the `'theme'` sentinel, unknown names, or non-string
 * input — callers treat `null` as "keep the tenant's existing radius".
 */
export function resolveRoundness(value: unknown): number | null {
  if (typeof value !== 'string' || value === 'theme') return null
  const px = ROUNDNESS_PRESETS[value as Exclude<CardRoundness, 'theme'>]
  return px === undefined ? null : px
}
