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

/**
 * Google Fonts families used by the pairings, with the weights each one needs.
 * The storefront loads exactly these via a single `css2` stylesheet so the
 * pairings render with their true typefaces instead of the generic fallback.
 * Keep this in sync with FONT_PAIRS — `buildStorefrontFontsHref`'s tests guard
 * against drift.
 */
export const STOREFRONT_GOOGLE_FONTS: Record<string, number[]> = {
  Archivo: [400, 500, 600, 700, 900],
  'Cormorant Garamond': [500, 600, 700],
  Anton: [400],
  Lora: [400, 500, 600, 700],
  Karla: [400, 500, 700],
}

/**
 * Extract the primary family name from a CSS `font-family` string, e.g.
 * `"'Cormorant Garamond', serif"` → `Cormorant Garamond`.
 */
export function fontFamilyName(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? ''
  return first.trim().replace(/^['"]|['"]$/g, '')
}

/**
 * Build the Google Fonts `css2` stylesheet URL for every storefront font,
 * derived from STOREFRONT_GOOGLE_FONTS. Single-weight families are requested
 * bare (the `css2` API rejects an explicit weight for fonts that have only one).
 */
export function buildStorefrontFontsHref(): string {
  const families = Object.entries(STOREFRONT_GOOGLE_FONTS)
    .map(([family, weights]) => {
      const name = family.replace(/ /g, '+')
      const isSingleDefaultWeight = weights.length === 1 && weights[0] === 400
      return isSingleDefaultWeight ? `family=${name}` : `family=${name}:wght@${weights.join(';')}`
    })
    .join('&')
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}

/**
 * Build a scoped CSS rule that applies the chosen heading font pairing to every
 * heading element inside `scopeSelector`. Font family and weight are read from
 * the `--brand-heading-*` CSS vars (set inline on the storefront root only when
 * a pairing is chosen), so this static rule is a no-op until a knob is set and
 * carries no interpolated/untrusted values.
 */
export function buildHeadingFontCss(scopeSelector: string): string {
  return (
    `${scopeSelector} :is(h1,h2,h3,h4,h5,h6){` +
    'font-family: var(--brand-heading-font);' +
    'font-weight: var(--brand-heading-weight);' +
    '}'
  )
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
