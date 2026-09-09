import type { CSSProperties } from 'react'
import {
  darkenColor,
  generateBrandingCSS,
  getContrastColor,
  setAlpha,
  type BrandingColors,
} from '@/lib/branding-utils'

/**
 * The tracking dashboard's palette, derived from the tenant's storefront
 * branding. Emitted as CSS variables on the page root so every child paints
 * with `var(--trk-*)` and never with a hard-coded colour.
 *
 * `--trk-accent` is the brand primary: the hero, the live stamp, the active
 * step. `--trk-cta` is the storefront button colour, so the one button the
 * customer is asked to press looks like every other button in the store.
 */
export function buildTrackingTheme(branding: BrandingColors): CSSProperties {
  const accent = branding.primary
  const theme: Record<string, string> = {
    ...(generateBrandingCSS(branding) as Record<string, string>),
    '--trk-bg': branding.background,
    '--trk-card': branding.cards,
    '--trk-card-border': branding.cardsBorder,
    '--trk-text': branding.textPrimary,
    '--trk-text-muted': branding.textSecondary,
    '--trk-text-faint': branding.textMuted,
    '--trk-accent': accent,
    '--trk-accent-soft': setAlpha(accent, 0.12),
    '--trk-accent-tint': setAlpha(accent, 0.06),
    '--trk-accent-strong': darkenColor(accent, 0.18),
    '--trk-on-accent': getContrastColor(accent),
    '--trk-cta': branding.buttonPrimary,
    '--trk-on-cta': branding.buttonPrimaryText,
    '--trk-success': branding.success,
    '--trk-success-soft': setAlpha(branding.success, 0.14),
    '--trk-warning': branding.warning,
    '--trk-warning-soft': setAlpha(branding.warning, 0.14),
    '--trk-error': branding.error,
  }
  return theme as CSSProperties
}
