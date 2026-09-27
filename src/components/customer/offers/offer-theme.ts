import type { BrandingColors } from '@/lib/branding-utils'

/**
 * The handful of colours every diner-facing offer needs, resolved from the
 * merchant's branding. Offers never hard-code a palette: the storefront is
 * white-labelled, and a grey popup on a merchant's red-and-gold menu is the
 * platform's look leaking through.
 */
export interface OfferTheme {
  surface: string
  card: string
  text: string
  muted: string
  border: string
  accent: string
  accentText: string
  success: string
}

export const NEUTRAL_OFFER_THEME: OfferTheme = {
  surface: '#ffffff',
  card: '#ffffff',
  text: '#111111',
  muted: '#6b7280',
  border: '#e5e7eb',
  accent: '#111111',
  accentText: '#ffffff',
  success: '#15803d',
}

type ThemeSource = Partial<BrandingColors> | null | undefined

function pick(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? undefined
}

/** Item page and "just added" sheet: the product modal's own colours. */
export function offerThemeFromBranding(branding: ThemeSource): OfferTheme {
  const b = branding ?? {}
  return {
    surface: pick(b.modalBackground, b.background) ?? NEUTRAL_OFFER_THEME.surface,
    card: pick(b.cards, b.modalBackground) ?? NEUTRAL_OFFER_THEME.card,
    text: pick(b.modalTitle, b.textPrimary) ?? NEUTRAL_OFFER_THEME.text,
    muted: pick(b.modalDescription, b.textMuted, b.textSecondary) ?? NEUTRAL_OFFER_THEME.muted,
    border: pick(b.cardsBorder, b.border) ?? NEUTRAL_OFFER_THEME.border,
    accent: pick(b.buttonPrimary, b.primary) ?? NEUTRAL_OFFER_THEME.accent,
    accentText: pick(b.buttonPrimaryText) ?? NEUTRAL_OFFER_THEME.accentText,
    success: pick(b.success) ?? NEUTRAL_OFFER_THEME.success,
  }
}

/**
 * The cart's last call. Uses the `checkout_modal_*` colours merchants already
 * set for the old checkout pop-up — which that pop-up accepted and then never
 * applied — so their choices finally reach the diner.
 */
export function cartOfferThemeFromBranding(branding: ThemeSource): OfferTheme {
  const base = offerThemeFromBranding(branding)
  const b = branding ?? {}
  return {
    ...base,
    card: pick(b.checkoutModalBackground, base.card) ?? base.card,
    text: pick(b.checkoutModalTitle, base.text) ?? base.text,
    muted: pick(b.checkoutModalDescription, base.muted) ?? base.muted,
    border: pick(b.checkoutModalBorder, base.border) ?? base.border,
    accent: pick(b.checkoutModalButton, b.cartAccent, base.accent) ?? base.accent,
    accentText: pick(b.checkoutModalButtonText, base.accentText) ?? base.accentText,
  }
}
