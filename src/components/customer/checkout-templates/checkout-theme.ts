/**
 * Checkout colour theme: the ONE place a checkout screen gets its colours.
 *
 * `getCheckoutPalette` resolves every surface from the store's brand (blank
 * checkout columns inherit it), so a dark store gets a dark checkout. This
 * module turns that palette into CSS custom properties (`--co-*`) that a
 * screen sets once on its root; descendants then use the matching Tailwind
 * arbitrary-value classes (`bg-[var(--co-card)]`, `text-[color:var(--co-muted)]`,
 * …) instead of literal light colours. Anything rendered in a portal (dialogs)
 * must set the variables on its own root — a portal does not inherit them.
 *
 * Neutral tints (`subtle`, `subtleStrong`) are drawn from the TEXT colour, so
 * they darken a light page and lighten a dark one. Semantic colours (success,
 * warning, error) come from the store's branding.
 */

import type { CSSProperties } from 'react'
import { getCheckoutPalette, getTenantBranding, setAlpha, type BrandingColors } from '@/lib/branding-utils'

export interface CheckoutTheme {
  background: string
  card: string
  summary: string
  text: string
  muted: string
  border: string
  /** Faint neutral wash (rows, input fills) — 5% of the text colour. */
  subtle: string
  /** Stronger neutral wash (icon circles, unselected chips) — 9% of the text colour. */
  subtleStrong: string
  accent: string
  accentText: string
  accentSoft: string
  accentSofter: string
  accentBorder: string
  /** Place-order button background (explicit override, else the accent). */
  button: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  warningBorder: string
  error: string
  errorSoft: string
}

const SUBTLE_ALPHA = 0.05
const SUBTLE_STRONG_ALPHA = 0.09
const SEMANTIC_SOFT_ALPHA = 0.12
const SEMANTIC_BORDER_ALPHA = 0.45

/**
 * Resolve every checkout colour from the tenant's checkout columns + brand.
 * Missing branding fields (a partial test double, a screen rendered before
 * the hook settles) fall back to the platform defaults: a clean light checkout.
 */
export function resolveCheckoutTheme(
  tenant: Record<string, unknown> | null | undefined,
  brandingInput: BrandingColors | null | undefined,
): CheckoutTheme {
  // Spread over the defaults so a partial branding object still yields a
  // complete theme (every field below is read).
  const branding: BrandingColors = { ...getTenantBranding(null), ...brandingInput }
  const palette = getCheckoutPalette(tenant, branding)
  const card = palette.cardBackground ?? branding.cards
  const text = palette.text ?? branding.textPrimary
  return {
    background: palette.background ?? branding.background,
    card,
    summary: palette.summaryBackground ?? card,
    text,
    muted: palette.mutedText ?? branding.textSecondary,
    border: palette.border ?? branding.border,
    subtle: setAlpha(text, SUBTLE_ALPHA),
    subtleStrong: setAlpha(text, SUBTLE_STRONG_ALPHA),
    accent: palette.accent,
    accentText: palette.accentText,
    accentSoft: palette.accentSoft,
    accentSofter: palette.accentSofter ?? setAlpha(palette.accent, 0.04),
    accentBorder: palette.accentBorder,
    button: palette.button ?? palette.accent,
    success: branding.success,
    successSoft: setAlpha(branding.success, SEMANTIC_SOFT_ALPHA),
    warning: branding.warning,
    warningSoft: setAlpha(branding.warning, SEMANTIC_SOFT_ALPHA),
    warningBorder: setAlpha(branding.warning, SEMANTIC_BORDER_ALPHA),
    error: branding.error,
    errorSoft: setAlpha(branding.error, SEMANTIC_SOFT_ALPHA),
  }
}

/** The theme as `--co-*` custom properties, for a screen's (or portal's) root `style`. */
export function checkoutThemeVars(theme: CheckoutTheme): CSSProperties {
  const vars: Record<string, string> = {
    '--co-bg': theme.background,
    '--co-card': theme.card,
    '--co-summary': theme.summary,
    '--co-text': theme.text,
    '--co-muted': theme.muted,
    '--co-border': theme.border,
    '--co-subtle': theme.subtle,
    '--co-subtle-strong': theme.subtleStrong,
    '--co-accent': theme.accent,
    '--co-accent-text': theme.accentText,
    '--co-accent-soft': theme.accentSoft,
    '--co-accent-softer': theme.accentSofter,
    '--co-accent-border': theme.accentBorder,
    '--co-button': theme.button,
    '--co-success': theme.success,
    '--co-success-soft': theme.successSoft,
    '--co-warning': theme.warning,
    '--co-warning-soft': theme.warningSoft,
    '--co-warning-border': theme.warningBorder,
    '--co-error': theme.error,
    '--co-error-soft': theme.errorSoft,
  }
  return vars as CSSProperties
}

/** Shorthand: the `--co-*` variables for a useCheckout() return value. */
export function checkoutThemeStyle(checkout: {
  tenant: Record<string, unknown> | null | undefined
  branding: BrandingColors | null | undefined
}): CSSProperties {
  return checkoutThemeVars(resolveCheckoutTheme(checkout.tenant, checkout.branding))
}

/**
 * Shared class strings. Kept as whole literals so Tailwind's scanner sees them.
 */
export const CO = {
  page: 'bg-[var(--co-bg)] text-[color:var(--co-text)]',
  card: 'bg-[var(--co-card)] text-[color:var(--co-text)] border-[color:var(--co-border)]',
  input:
    'border border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--co-accent)] focus:border-[color:var(--co-accent)]',
  text: 'text-[color:var(--co-text)]',
  muted: 'text-[color:var(--co-muted)]',
  border: 'border-[color:var(--co-border)]',
  error: 'text-[color:var(--co-error)]',
  success: 'text-[color:var(--co-success)]',
} as const
