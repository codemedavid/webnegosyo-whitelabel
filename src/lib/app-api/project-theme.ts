import type { AppColors, AppCornerStyle, AppFontKey, AppTheme } from '@/lib/app-contract'
import { DEFAULT_BRANDING, getTenantBranding } from '@/lib/branding-utils'
import { MIN_TEXT_CONTRAST, contrastRatio, mixHex, readableTextOn } from '@/lib/color-contrast'

/**
 * The customer app's theme, derived from the store's existing branding so a
 * merchant styles the web and the app in one place. The app never computes
 * brand colours itself: every `on*` pair leaves here readable (WCAG AA).
 */

const HEX_6 = /^#[0-9a-f]{6}$/i
const HEX_3 = /^#[0-9a-f]{3}$/i
const SOFT_TINT = 0.85
const MUTED_TINT = 0.05

/** `#rrggbb` (lowercase) or null — native colour props take nothing else. */
function toHex6(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (HEX_6.test(trimmed)) return trimmed.toLowerCase()
  if (HEX_3.test(trimmed)) return `#${trimmed.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase()
  return null
}

const pick = (value: string | null | undefined, fallback: string | undefined): string => toHex6(value) ?? toHex6(fallback) ?? '#111111'

/** The web's font pairs don't share typefaces with the bundled app fonts; this is the closest feel. */
const FONT_FOR_PAIR: Record<string, AppFontKey> = {
  'elegant serif': 'fraunces',
  'warm editorial': 'fraunces',
  'bold display': 'poppins',
  'modern sans': 'inter',
}

const CORNERS: Record<string, AppCornerStyle> = { sharp: 'sharp', soft: 'soft', round: 'round' }

function onColour(preferred: string, background: string): string {
  return toHex6(readableTextOn(preferred, background)) ?? '#111111'
}

const DARK_INK = '#111111'
const LIGHT_INK = '#ffffff'

/** Plain dark or white ink, whichever reads better — for badges on a brand accent, where a nudged grey looks muddy. */
function inkOn(background: string): string {
  return (contrastRatio(DARK_INK, background) ?? 0) >= (contrastRatio(LIGHT_INK, background) ?? 0) ? DARK_INK : LIGHT_INK
}

/** A surface colour that is visibly different from the page but still holds body text. */
function ensureReadableSurface(surface: string, text: string): string {
  return (contrastRatio(text, surface) ?? 0) >= MIN_TEXT_CONTRAST ? surface : '#ffffff'
}

function projectColors(tenant: Record<string, unknown>): AppColors {
  const branding = getTenantBranding(tenant)
  const background = pick(branding.background, DEFAULT_BRANDING.background)
  const text = onColour(pick(branding.textPrimary, DEFAULT_BRANDING.textPrimary), background)
  const surface = ensureReadableSurface(pick(branding.cards, DEFAULT_BRANDING.cards), text)
  const primary = pick(branding.buttonPrimary, DEFAULT_BRANDING.buttonPrimary)
  const accent = pick(branding.accent, DEFAULT_BRANDING.accent)
  const primarySoft = toHex6(mixHex(primary, surface, SOFT_TINT)) ?? surface
  return {
    primary,
    onPrimary: onColour(pick(branding.buttonPrimaryText, DEFAULT_BRANDING.buttonPrimaryText), primary),
    primarySoft,
    onPrimarySoft: onColour(primary, primarySoft),
    accent,
    onAccent: inkOn(accent),
    background,
    surface,
    surfaceMuted: toHex6(mixHex(surface, text, MUTED_TINT)) ?? surface,
    text,
    textMuted: onColour(pick(branding.textSecondary, DEFAULT_BRANDING.textSecondary), background),
    border: pick(branding.border, DEFAULT_BRANDING.border),
    success: pick(branding.success, DEFAULT_BRANDING.success),
    warning: pick(branding.warning, DEFAULT_BRANDING.warning),
    danger: pick(branding.error, DEFAULT_BRANDING.error),
  }
}

function readString(tenant: Record<string, unknown>, key: string): string | null {
  const value = tenant[key]
  return typeof value === 'string' ? value : null
}

function httpsOrNull(value: string | null): string | null {
  return value && value.startsWith('https://') ? value : null
}

export function projectAppTheme(tenant: Record<string, unknown>): AppTheme {
  return {
    colors: projectColors(tenant),
    fontKey: FONT_FOR_PAIR[readString(tenant, 'font_pair') ?? ''] ?? 'jakarta',
    corners: CORNERS[readString(tenant, 'card_roundness') ?? ''] ?? 'soft',
    logoUrl: httpsOrNull(readString(tenant, 'logo_url')),
  }
}
