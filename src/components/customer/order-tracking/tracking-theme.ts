import type { CSSProperties } from 'react'
import { generateBrandingCSS, type BrandingColors } from '@/lib/branding-utils'
import { DEFAULT_TRACKING_OPTIONS, type TrackingStyle } from '@/lib/tracking-style/keys'
import { resolveTrackingPalette, type TrackingPalette } from '@/lib/tracking-style/palette'

/** CSS variable each palette entry is published under. */
const TRACKING_VARS: Readonly<Record<keyof TrackingPalette, string>> = {
  background: '--trk-bg',
  glow: '--trk-glow',
  card: '--trk-card',
  cardBorder: '--trk-card-border',
  text: '--trk-text',
  textMuted: '--trk-text-muted',
  textFaint: '--trk-text-faint',
  accent: '--trk-accent',
  accentSoft: '--trk-accent-soft',
  accentTint: '--trk-accent-tint',
  accentStrong: '--trk-accent-strong',
  onAccent: '--trk-on-accent',
  cta: '--trk-cta',
  onCta: '--trk-on-cta',
  success: '--trk-success',
  successSoft: '--trk-success-soft',
  warning: '--trk-warning',
  warningSoft: '--trk-warning-soft',
  error: '--trk-error',
  radius: '--trk-radius',
  radiusInner: '--trk-radius-inner',
  radiusPill: '--trk-radius-pill',
  headerBackground: '--trk-header-bg',
  headerText: '--trk-header-text',
  headerMuted: '--trk-header-muted',
  live: '--trk-live',
  liveSoft: '--trk-live-soft',
  heroBackground: '--trk-hero-bg',
  heroBorder: '--trk-hero-border',
  heroText: '--trk-hero-text',
  heroChip: '--trk-hero-chip',
  heroChipSoft: '--trk-hero-chip-soft',
  heroDecor: '--trk-hero-decor',
  heroTrack: '--trk-hero-track',
  heroBar: '--trk-hero-bar',
  cancelledBackground: '--trk-cancelled-bg',
  cancelledText: '--trk-cancelled-text',
  ringBackground: '--trk-ring-bg',
  ringText: '--trk-ring-text',
  ringBorder: '--trk-ring-border',
  ringArmed: '--trk-ring-armed',
  ringArmedSoft: '--trk-ring-armed-soft',
  stepDone: '--trk-step-done',
  onStepDone: '--trk-on-step-done',
  stepCurrent: '--trk-step-current',
  onStepCurrent: '--trk-on-step-current',
  stepCurrentSoft: '--trk-step-current-soft',
  stepUpcoming: '--trk-step-upcoming',
  total: '--trk-total',
  qtyBackground: '--trk-qty-bg',
  qtyText: '--trk-qty-text',
  pickupBackground: '--trk-pickup-bg',
  pickupBorder: '--trk-pickup-border',
  pickupText: '--trk-pickup-text',
  pickupMuted: '--trk-pickup-muted',
  pickupReady: '--trk-pickup-ready',
  pickupReadyBackground: '--trk-pickup-ready-bg',
  alertBackground: '--trk-alert-bg',
  alertText: '--trk-alert-text',
  alertButton: '--trk-alert-button',
  alertButtonText: '--trk-alert-button-text',
  loyaltyBackground: '--trk-loy-bg',
  loyaltyBorder: '--trk-loy-border',
  loyaltyText: '--trk-loy-text',
  loyaltyMuted: '--trk-loy-muted',
  loyaltyFaint: '--trk-loy-faint',
  inputBackground: '--trk-input-bg',
  inputText: '--trk-input-text',
  inputPlaceholder: '--trk-input-placeholder',
  bandBackground: '--trk-band-bg',
  bandText: '--trk-band-text',
  bandBorder: '--trk-band-border',
  bandChip: '--trk-band-chip',
  bandSoft: '--trk-band-soft',
  bandSoftText: '--trk-band-soft-text',
  bandInk: '--trk-band-ink',
  stamp: '--trk-stamp',
  stampSoft: '--trk-stamp-soft',
  stampTint: '--trk-stamp-tint',
  onStamp: '--trk-on-stamp',
  stampEmpty: '--trk-stamp-empty',
  stampNext: '--trk-stamp-next',
  stampNextTint: '--trk-stamp-next-tint',
  stampBadge: '--trk-stamp-badge',
  onStampBadge: '--trk-on-stamp-badge',
  stampReached: '--trk-stamp-reached',
  onStampReached: '--trk-on-stamp-reached',
  stampRadius: '--trk-stamp-radius',
  loyaltyButton: '--trk-loy-cta',
  loyaltyButtonText: '--trk-on-loy-cta',
  loyaltyLink: '--trk-loy-link',
  walletBackground: '--trk-wallet-bg',
  walletText: '--trk-wallet-text',
  walletMuted: '--trk-wallet-muted',
}

/** Every `--trk-*` variable the theme defines (the components may read only these). */
export const TRACKING_THEME_VARIABLES: readonly string[] = Object.values(TRACKING_VARS)

const NO_STYLE: TrackingStyle = { colors: {}, options: DEFAULT_TRACKING_OPTIONS }

/**
 * The tracking dashboard's palette, derived from the tenant's storefront
 * branding and the owner's `tracking_style` (Branding Studio → Order status /
 * Loyalty card). Emitted as CSS variables on the page root so every child
 * paints with `var(--trk-*)` and never with a hard-coded colour.
 *
 * `--trk-accent` is the brand primary unless the owner picks a page accent:
 * the live dot, the active step, the total. The status banner, the alert and
 * the loyalty card have their own variables that follow it until set.
 */
export function buildTrackingTheme(branding: BrandingColors, trackingStyle: TrackingStyle = NO_STYLE): CSSProperties {
  const palette = resolveTrackingPalette(branding, trackingStyle)
  const theme: Record<string, string> = { ...(generateBrandingCSS(branding) as Record<string, string>) }
  for (const [key, name] of Object.entries(TRACKING_VARS) as [keyof TrackingPalette, string][]) {
    theme[name] = palette[key]
  }
  return theme as CSSProperties
}
