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

/**
 * Presentation style for the storefront category navigation. `'theme'` is the
 * inherit sentinel — it keeps today's soft-tinted pills exactly as they are, so
 * an unset knob changes nothing. The concrete styles restyle the *shape* of each
 * category control only (colors still come from branding):
 * - `pills`     — soft-tinted rounded pills (today's look, named explicitly)
 * - `chips`     — outlined chips that fill with the accent when active
 * - `underline` — flat subheader tabs with an accent underline on the active one
 */
export type CategoryNavStyle = 'theme' | 'pills' | 'chips' | 'underline'

/**
 * A coordinated storefront color palette — the seven color roles the reference
 * design (Restaurant Storefront.dc.html) drives its whole surface from. Picking
 * a palette restyles the storefront in one move; it layers *under* any explicit
 * per-field color a merchant has set, so it is purely additive.
 */
export interface StorefrontPalette {
  /** Page background. */
  bg: string
  /** Cards / header / raised surfaces. */
  surface: string
  /** Primary text. */
  text: string
  /** Secondary / muted text. */
  muted: string
  /** Accent — buttons, highlights, active states. */
  accent: string
  /** Text/icon color that sits on top of the accent. */
  accentInk: string
  /** Hairlines and borders. */
  line: string
}

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

/**
 * Coordinated storefront palettes, sourced from the reference design's own
 * default values across its header/hero/card variants. Each is a cohesive
 * look a merchant can apply in one selection. `'theme'` (see options below) is
 * the inherit sentinel and is intentionally NOT a key here.
 */
export const STOREFRONT_PALETTES: Record<string, StorefrontPalette> = {
  'warm editorial': {
    bg: '#FFF6EC',
    surface: '#FFFFFF',
    text: '#1D1815',
    muted: '#8A7B70',
    accent: '#E4572E',
    accentInk: '#FFFFFF',
    line: '#EDE0CE',
  },
  'fine dining': {
    bg: '#16130F',
    surface: '#211C15',
    text: '#EFE7D8',
    muted: '#9C917E',
    accent: '#C69A5D',
    accentInk: '#16130F',
    line: '#3A352C',
  },
  'cafe soft': {
    bg: '#FBF6EF',
    surface: '#FFFBF3',
    text: '#3B2E25',
    muted: '#94816F',
    accent: '#A4643C',
    accentInk: '#FFFFFF',
    line: '#E4D5C2',
  },
  'bold diner': {
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    text: '#191919',
    muted: '#777777',
    accent: '#D7263D',
    accentInk: '#FFFFFF',
    line: '#ECECEC',
  },
  'fresh green': {
    bg: '#F4F8F4',
    surface: '#FFFFFF',
    text: '#16241C',
    muted: '#6E7F73',
    accent: '#2A6F4E',
    accentInk: '#FFFFFF',
    line: '#DCE7DF',
  },
}

/**
 * Concrete category-nav styles (excludes the `'theme'` inherit sentinel). Each
 * value is its own token — the resolver simply hands the token to `CategoryTabs`,
 * which maps it to a presentation without touching the branding colors.
 */
export const CATEGORY_NAV_STYLES: Record<Exclude<CategoryNavStyle, 'theme'>, true> = {
  pills: true,
  chips: true,
  underline: true,
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

/** Selectable palette options — `'theme'` leads as the inherit default. */
export const STOREFRONT_PALETTE_OPTIONS: readonly string[] = [
  'theme',
  ...Object.keys(STOREFRONT_PALETTES),
]

/** Selectable category-nav style options — `'theme'` leads as the inherit default. */
export const CATEGORY_NAV_STYLE_OPTIONS: readonly CategoryNavStyle[] = [
  'theme',
  ...(Object.keys(CATEGORY_NAV_STYLES) as Exclude<CategoryNavStyle, 'theme'>[]),
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

/**
 * Resolve a palette value into its coordinated colors.
 * Returns `null` for the `'theme'` sentinel, unknown ids, or non-string input —
 * callers treat `null` as "keep the tenant's existing per-field colors", so an
 * unset palette changes nothing.
 */
export function resolvePalette(value: unknown): StorefrontPalette | null {
  if (typeof value !== 'string' || value === 'theme') return null
  return STOREFRONT_PALETTES[value] ?? null
}

/**
 * Resolve a category-nav style into its variant token.
 * Returns `null` for the `'theme'` sentinel, unknown names, or non-string input —
 * callers treat `null` as "keep today's pills", so an unset knob changes nothing.
 */
export function resolveCategoryNavStyle(
  value: unknown
): Exclude<CategoryNavStyle, 'theme'> | null {
  if (typeof value !== 'string' || value === 'theme') return null
  const key = value as Exclude<CategoryNavStyle, 'theme'>
  return CATEGORY_NAV_STYLES[key] ? key : null
}

// --- Palette generation from a single seed color -----------------------------
// Self-contained hex helpers (storefront-theme must not import branding-utils —
// that module imports this one, and a cycle would break resolution).

const SIX_HEX = /^#[0-9a-fA-F]{6}$/

function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`
}

/** Mix a channel toward white (amount 0..1). */
function mixWhite([r, g, b]: [number, number, number], amount: number): string {
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}

/** Mix a channel toward black (amount 0..1). */
function mixBlack([r, g, b]: [number, number, number], amount: number): string {
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/**
 * Derive a full coordinated palette from one seed accent (the "generate from
 * logo color" action). The seed becomes the accent; background/surface/line are
 * light tints of it and text/muted are dark shades, so the whole storefront
 * stays in one hue family. Returns `null` for anything that isn't a 6-digit hex.
 */
export function generatePaletteFromColor(seed: unknown): StorefrontPalette | null {
  if (typeof seed !== 'string' || !SIX_HEX.test(seed.trim())) return null
  const accent = seed.trim()
  const rgb = hexChannels(accent)
  // Relative luminance → pick a readable ink (black/white) for on-accent text.
  const [r, g, b] = rgb
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    accent,
    accentInk: luminance > 0.55 ? '#000000' : '#ffffff',
    bg: mixWhite(rgb, 0.92),
    surface: mixWhite(rgb, 0.97),
    line: mixWhite(rgb, 0.82),
    text: mixBlack(rgb, 0.78),
    muted: mixBlack(rgb, 0.42),
  }
}
