/**
 * The multi-branch WELCOME page — what the starter screen looks like and how
 * the customer enters.
 *
 * The splash chooser (mode tiles → branch list) is becoming a branded page a
 * merchant designs in the Branding Studio: its own promo banners in three
 * formats, its own palette, and a choice of entry — the order-type tiles, or
 * one big call-to-action that jumps straight to the branch list and leaves the
 * order type to checkout (the flow the 'after' timing already proves out).
 *
 * Every existing tenant row predates all of these columns, so an absent or
 * unrecognised value MUST reproduce today's screen exactly: tiles shown, no
 * banners, default styling. Pure and dependency-free, like
 * `selection-timing.ts`, so the server render and the client overlay agree.
 */

export type WelcomeEntryMode = 'order_types' | 'single_cta'

export type WelcomeBannerFormat = 'landscape' | 'portrait' | 'square'

/** How the welcome header (logo, heading, subheading) is aligned. */
export type WelcomeTextAlign = 'left' | 'center'

/** A promo banner on the welcome page — separate from menu `promotion_banners`. */
export interface WelcomeBanner {
  id: string
  imageUrl: string
  format: WelcomeBannerFormat
  title?: string
  description?: string
}

/** The subset of tenant columns this module reads. All optional by design. */
export interface WelcomeTenantFields {
  welcome_entry_mode?: string | null
  welcome_show_order_types?: boolean | null
  welcome_cta_text?: string | null
  welcome_page_banners?: unknown
  welcome_heading_text?: string | null
  welcome_subheading_text?: string | null
  welcome_text_align?: string | null
  welcome_show_logo?: boolean | null
  welcome_show_header?: boolean | null
  welcome_show_copy?: boolean | null
  welcome_background_color?: string | null
  welcome_heading_color?: string | null
  welcome_subtext_color?: string | null
  welcome_tile_background_color?: string | null
  welcome_tile_icon_color?: string | null
  welcome_tile_text_color?: string | null
  welcome_cta_background_color?: string | null
  welcome_cta_text_color?: string | null
}

/** Explicit overrides only; null means "keep the screen's default styling". */
export interface WelcomeTheme {
  backgroundColor: string | null
  headingColor: string | null
  subtextColor: string | null
  tileBackgroundColor: string | null
  tileIconColor: string | null
  tileTextColor: string | null
  ctaBackgroundColor: string | null
  ctaTextColor: string | null
}

export const DEFAULT_WELCOME_ENTRY_MODE: WelcomeEntryMode = 'order_types'
export const DEFAULT_WELCOME_TEXT_ALIGN: WelcomeTextAlign = 'left'
export const DEFAULT_WELCOME_CTA_TEXT = 'Start Ordering'

const BANNER_FORMATS: readonly WelcomeBannerFormat[] = ['landscape', 'portrait', 'square']

/** How the customer enters. Anything unknown means today's order-type tiles. */
export function resolveWelcomeEntryMode(
  tenant: WelcomeTenantFields | null | undefined
): WelcomeEntryMode {
  return tenant?.welcome_entry_mode === 'single_cta' ? 'single_cta' : DEFAULT_WELCOME_ENTRY_MODE
}

/**
 * Whether the welcome page opens on the order-type tiles.
 *
 * The single CTA and the tiles are alternative entries, so the CTA choice wins
 * over the visibility toggle — otherwise a merchant could configure a page
 * with two competing "start here" affordances.
 */
export function shouldShowOrderTypeStep(tenant: WelcomeTenantFields | null | undefined): boolean {
  if (resolveWelcomeEntryMode(tenant) === 'single_cta') return false
  return tenant?.welcome_show_order_types !== false
}

/** The big button's label; blank or whitespace falls back to the default. */
export function resolveWelcomeCtaText(tenant: WelcomeTenantFields | null | undefined): string {
  const custom = tenant?.welcome_cta_text?.trim()
  return custom || DEFAULT_WELCOME_CTA_TEXT
}

/**
 * Header alignment. Left is what shipped, so anything unset or unrecognised
 * keeps it — centring is opt-in, like every other welcome-page column.
 */
export function resolveWelcomeTextAlign(
  tenant: WelcomeTenantFields | null | undefined
): WelcomeTextAlign {
  return tenant?.welcome_text_align === 'center' ? 'center' : DEFAULT_WELCOME_TEXT_ALIGN
}

/** Whether the store logo sits above the heading. Off unless switched on. */
export function shouldShowWelcomeLogo(tenant: WelcomeTenantFields | null | undefined): boolean {
  return tenant?.welcome_show_logo === true
}

/**
 * Whether the page leads with a header at all.
 *
 * Unlike the logo, this one defaults ON: every tenant predating the column has
 * a heading today, and the switch only ever takes something away.
 */
export function shouldShowWelcomeHeader(tenant: WelcomeTenantFields | null | undefined): boolean {
  return tenant?.welcome_show_header !== false
}

/**
 * Whether the heading and subheading are written out. Off leaves a logo-only
 * header — the shape merchants want once the branding does the talking.
 *
 * The copy lives inside the header, so hiding the header hides the copy too:
 * an on-copy/off-header row must not resurrect the heading.
 */
export function shouldShowWelcomeCopy(tenant: WelcomeTenantFields | null | undefined): boolean {
  if (!shouldShowWelcomeHeader(tenant)) return false
  return tenant?.welcome_show_copy !== false
}

function coerceFormat(value: unknown): WelcomeBannerFormat {
  return BANNER_FORMATS.includes(value as WelcomeBannerFormat)
    ? (value as WelcomeBannerFormat)
    : 'landscape'
}

/**
 * Banner rows come straight out of a jsonb column, so nothing about their
 * shape can be trusted. Entries without an image cannot render and are
 * dropped; an unknown format is coerced to landscape rather than discarding a
 * banner the merchant uploaded.
 */
export function normalizeWelcomeBanners(raw: unknown): WelcomeBanner[] {
  if (!Array.isArray(raw)) return []
  const banners: WelcomeBanner[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as Record<string, unknown>
    const imageUrl = typeof candidate.imageUrl === 'string' ? candidate.imageUrl.trim() : ''
    if (!imageUrl) continue
    const banner: WelcomeBanner = {
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : imageUrl,
      imageUrl,
      format: coerceFormat(candidate.format),
    }
    if (typeof candidate.title === 'string' && candidate.title) banner.title = candidate.title
    if (typeof candidate.description === 'string' && candidate.description) {
      banner.description = candidate.description
    }
    banners.push(banner)
  }
  return banners
}

function colorOrNull(value: string | null | undefined): string | null {
  return value?.trim() ? value : null
}

/**
 * Explicit welcome-page colours only. Anything unset resolves to null so the
 * screen keeps its Tailwind defaults — mirroring how the cart/checkout page
 * palettes treat undefined as a no-op rather than inventing a fallback.
 */
export function resolveWelcomeTheme(tenant: WelcomeTenantFields | null | undefined): WelcomeTheme {
  return {
    backgroundColor: colorOrNull(tenant?.welcome_background_color),
    headingColor: colorOrNull(tenant?.welcome_heading_color),
    subtextColor: colorOrNull(tenant?.welcome_subtext_color),
    tileBackgroundColor: colorOrNull(tenant?.welcome_tile_background_color),
    tileIconColor: colorOrNull(tenant?.welcome_tile_icon_color),
    tileTextColor: colorOrNull(tenant?.welcome_tile_text_color),
    ctaBackgroundColor: colorOrNull(tenant?.welcome_cta_background_color),
    ctaTextColor: colorOrNull(tenant?.welcome_cta_text_color),
  }
}
