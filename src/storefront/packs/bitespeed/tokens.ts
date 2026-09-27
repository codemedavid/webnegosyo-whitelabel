import type { CSSProperties } from 'react'
import type { BrandingColors } from '@/lib/branding-utils'
import { luminanceOf } from '@/lib/card-color'

/**
 * BiteSpeed design tokens: a fast-food ordering site with tinted surface tiers,
 * one bold accent fill and a display + body font pair.
 *
 * Every token is derived from the tenant's branding, so a merchant's colors,
 * font pairing and corner style still apply. The tinted tiers are mixed in CSS
 * (`color-mix`) from the brand colors rather than stored as extra columns.
 *
 * Plain module (no 'use client'): shared by the pack's pages and its checkout
 * design.
 */
export const BITESPEED_DISPLAY_FONT = '"Outfit", ui-sans-serif, system-ui, sans-serif'
export const BITESPEED_BODY_FONT = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif'
export const BITESPEED_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'

const DEFAULT_RADIUS = '1rem'
/** Below this luminance an accent disappears against the hero's dark photo scrim. */
const DARK_ACCENT_LUMINANCE = 0.3
const HERO_ACCENT_TINT_PERCENT = 18
const DARK_TEXT = '#111111'

const mix = (color: string, percent: number, base: string) => `color-mix(in srgb, ${color} ${percent}%, ${base})`

export type BiteSpeedTokenName =
  | '--bs-accent' | '--bs-on-accent' | '--bs-accent-ink' | '--bs-accent-soft'
  | '--bs-bg' | '--bs-surface' | '--bs-surface-low' | '--bs-surface-high'
  | '--bs-text' | '--bs-text-muted' | '--bs-outline'
  | '--bs-hero-accent' | '--bs-on-hero-accent'
  | '--bs-font-display' | '--bs-font-body' | '--bs-radius'

/**
 * The accent drawn over the hero photo. A dark brand accent (a black or navy
 * button color) would vanish against the dark scrim, so it is lightened to a
 * near-white tint of itself, with dark text on top.
 */
function heroAccent(branding: BrandingColors): { fill: string; text: string } {
  const luminance = luminanceOf(branding.buttonPrimary)
  if (luminance === null || luminance >= DARK_ACCENT_LUMINANCE) {
    return { fill: branding.buttonPrimary, text: branding.buttonPrimaryText }
  }
  return { fill: mix(branding.buttonPrimary, HERO_ACCENT_TINT_PERCENT, '#ffffff'), text: DARK_TEXT }
}

export function bitespeedTokens(branding: BrandingColors): Record<BiteSpeedTokenName, string> {
  const hero = heroAccent(branding)
  return {
    // The call-to-action fill (buttons, badges, active chips) and its text.
    '--bs-accent': branding.buttonPrimary,
    '--bs-on-accent': branding.buttonPrimaryText,
    // Accent text on light surfaces: prices, highlighted headline words, links.
    '--bs-accent-ink': branding.primary,
    '--bs-accent-soft': mix(branding.buttonPrimary, 12, branding.cards),
    '--bs-bg': branding.background,
    '--bs-surface': branding.cards,
    '--bs-surface-low': mix(branding.textPrimary, 4, branding.background),
    '--bs-surface-high': mix(branding.textPrimary, 10, branding.background),
    '--bs-text': branding.textPrimary,
    '--bs-text-muted': branding.textSecondary,
    '--bs-outline': branding.border,
    '--bs-hero-accent': hero.fill,
    '--bs-on-hero-accent': hero.text,
    '--bs-font-display': branding.headingFont ?? BITESPEED_DISPLAY_FONT,
    '--bs-font-body': branding.bodyFont ?? BITESPEED_BODY_FONT,
    '--bs-radius': branding.radius ?? DEFAULT_RADIUS,
  }
}

/** Root style for a BiteSpeed surface: the tokens plus the page font and colors. */
export function bitespeedRootStyle(branding: BrandingColors): CSSProperties {
  return {
    ...(bitespeedTokens(branding) as CSSProperties),
    backgroundColor: 'var(--bs-bg)',
    color: 'var(--bs-text)',
    fontFamily: 'var(--bs-font-body)',
  }
}
