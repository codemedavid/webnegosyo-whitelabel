/**
 * Footer utilities for the customizable storefront footer.
 *
 * Pure, dependency-light contract shared by the admin settings editor, the
 * customer-facing footer component, and the four single-text content pages
 * (About Us / Terms of Service / Refund-Cancellation Policy / Privacy Policy).
 *
 * Reads raw tenant rows (snake_case columns) and produces a normalized
 * FooterConfig with resolved theme colors.
 */

import { getTenantBranding } from '@/lib/branding-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FooterTheme =
  | 'auto'
  | 'light'
  | 'dark'
  | 'brand'
  | 'midnight'
  | 'minimal'
  | 'custom'

export interface FooterColors {
  background: string
  text: string
  heading: string
  link: string
  muted: string
  icon: string
  iconBackground: string
  border: string
}

export interface FooterContact {
  address: string
  phone: string
  whatsapp: string
  viber: string
  email: string
}

export interface FooterSocialLink {
  url: string
  name: string
}

export interface FooterSocials {
  facebook: FooterSocialLink
  instagram: FooterSocialLink
  tiktok: FooterSocialLink
  twitter: FooterSocialLink
  youtube: FooterSocialLink
}

export interface FooterContent {
  aboutUs: string
  termsOfService: string
  refundPolicy: string
  privacyPolicy: string
}

export interface FooterConfig {
  enabled: boolean
  theme: FooterTheme
  logoUrl: string
  businessName: string
  tagline: string
  contact: FooterContact
  socials: FooterSocials
  content: FooterContent
  copyrightText: string
  showPoweredBy: boolean
  poweredByText: string
  colors: FooterColors
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FOOTER_CONTENT_PAGES: ReadonlyArray<{
  slug: 'about' | 'terms' | 'refund' | 'privacy'
  title: string
  key: keyof FooterContent
}> = [
  { slug: 'about', title: 'About Us', key: 'aboutUs' },
  { slug: 'terms', title: 'Terms of Service', key: 'termsOfService' },
  { slug: 'refund', title: 'Refund / Cancellation Policy', key: 'refundPolicy' },
  { slug: 'privacy', title: 'Privacy Policy', key: 'privacyPolicy' },
] as const

export const FOOTER_THEME_PRESETS: Record<
  'light' | 'dark' | 'midnight' | 'minimal',
  FooterColors
> = {
  light: {
    background: '#ffffff',
    text: '#374151',
    heading: '#111827',
    link: '#4b7d52',
    muted: '#6b7280',
    icon: '#ffffff',
    iconBackground: '#6f9c6f',
    border: '#e5e7eb',
  },
  dark: {
    background: '#111827',
    text: '#d1d5db',
    heading: '#ffffff',
    link: '#86efac',
    muted: '#9ca3af',
    icon: '#0b1220',
    iconBackground: '#34d399',
    border: '#1f2937',
  },
  midnight: {
    background: '#0b1120',
    text: '#cbd5e1',
    heading: '#f8fafc',
    link: '#93c5fd',
    muted: '#64748b',
    icon: '#0b1120',
    iconBackground: '#3b82f6',
    border: '#1e293b',
  },
  minimal: {
    background: '#fafafa',
    text: '#525252',
    heading: '#171717',
    link: '#171717',
    muted: '#a3a3a3',
    icon: '#ffffff',
    iconBackground: '#171717',
    border: '#e5e5e5',
  },
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely read a string column from a raw tenant row.
 * Returns '' for anything that is not a non-empty string.
 */
function readString(tenant: Record<string, unknown>, key: string): string {
  const value = tenant[key]
  return typeof value === 'string' ? value : ''
}

const SAFE_URL_SCHEMES: ReadonlyArray<string> = ['http:', 'https:']

/**
 * Allow only http/https URLs through, returning '' for anything else.
 *
 * Tenant-supplied URLs (social links, logo) are rendered into `href`/`src`
 * attributes on the public storefront. A `javascript:`, `data:`, or
 * `vbscript:` value would execute as script for every visitor, so we reject
 * any scheme outside the allowlist at the data boundary.
 */
export function sanitizeExternalUrl(url: string): string {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return SAFE_URL_SCHEMES.includes(parsed.protocol) ? trimmed : ''
  } catch {
    // Not an absolute URL (e.g. a relative path) — reject for external use.
    return ''
  }
}

/** Read a tenant column and keep it only if it is a safe external URL. */
function readSafeUrl(tenant: Record<string, unknown>, key: string): string {
  return sanitizeExternalUrl(readString(tenant, key))
}

/**
 * Pick the first non-empty string from a list of candidates.
 */
function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    if (value) return value
  }
  return ''
}

const VALID_THEMES: ReadonlyArray<FooterTheme> = [
  'auto',
  'light',
  'dark',
  'brand',
  'midnight',
  'minimal',
  'custom',
]

function normalizeTheme(value: unknown): FooterTheme {
  return typeof value === 'string' && (VALID_THEMES as string[]).includes(value)
    ? (value as FooterTheme)
    : 'auto'
}

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the footer color palette for a tenant.
 *
 * Computes a base palette from footer_theme, then overrides any individual
 * color whose matching footer_*_color column holds a non-empty string.
 * Always returns concrete hex strings.
 */
export function getFooterColors(tenant: Record<string, unknown>): FooterColors {
  const theme = normalizeTheme(tenant['footer_theme'])

  let base: FooterColors

  if (
    theme === 'light' ||
    theme === 'dark' ||
    theme === 'midnight' ||
    theme === 'minimal'
  ) {
    base = { ...FOOTER_THEME_PRESETS[theme] }
  } else if (theme === 'brand') {
    const branding = getTenantBranding(tenant)
    base = {
      background: branding.background,
      text: branding.textSecondary,
      heading: branding.textPrimary,
      link: branding.primary,
      muted: branding.textMuted,
      icon: '#ffffff',
      iconBackground: branding.primary,
      border: branding.border,
    }
  } else if (theme === 'custom') {
    base = { ...FOOTER_THEME_PRESETS.light }
  } else {
    // 'auto'
    const branding = getTenantBranding(tenant)
    base = {
      background: branding.background,
      text: branding.textSecondary,
      heading: branding.textPrimary,
      link: branding.link,
      muted: branding.textMuted,
      icon: '#ffffff',
      iconBackground: branding.primary,
      border: branding.border,
    }
  }

  const override = (key: string, current: string): string => {
    const value = readString(tenant, key)
    return value || current
  }

  return {
    background: override('footer_background_color', base.background),
    text: override('footer_text_color', base.text),
    heading: override('footer_heading_color', base.heading),
    link: override('footer_link_color', base.link),
    muted: override('footer_muted_color', base.muted),
    icon: override('footer_icon_color', base.icon),
    iconBackground: override('footer_icon_background_color', base.iconBackground),
    border: override('footer_border_color', base.border),
  }
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Build a normalized FooterConfig from a raw tenant row.
 */
export function getFooterConfig(tenant: Record<string, unknown>): FooterConfig {
  const theme = normalizeTheme(tenant['footer_theme'])

  const businessName = firstNonEmpty(
    readString(tenant, 'footer_business_name'),
    readString(tenant, 'name'),
  )

  const copyrightOverride = readString(tenant, 'footer_copyright_text')
  const copyrightText = copyrightOverride
    ? copyrightOverride
    : `© ${new Date().getFullYear()} ${businessName}. All rights reserved.`

  const poweredByText =
    readString(tenant, 'footer_powered_by_text') || 'Powered by WebNegosyo'

  return {
    enabled: tenant['footer_enabled'] !== false,
    theme,
    logoUrl: firstNonEmpty(
      readSafeUrl(tenant, 'footer_logo_url'),
      readSafeUrl(tenant, 'logo_url'),
    ),
    businessName,
    tagline: readString(tenant, 'footer_tagline'),
    contact: {
      address: firstNonEmpty(
        readString(tenant, 'footer_address'),
        readString(tenant, 'restaurant_address'),
      ),
      phone: readString(tenant, 'footer_phone'),
      whatsapp: readString(tenant, 'footer_whatsapp'),
      viber: readString(tenant, 'footer_viber'),
      email: readString(tenant, 'footer_email'),
    },
    socials: {
      facebook: {
        url: readSafeUrl(tenant, 'footer_facebook_url'),
        name: readString(tenant, 'footer_facebook_name'),
      },
      instagram: {
        url: readSafeUrl(tenant, 'footer_instagram_url'),
        name: readString(tenant, 'footer_instagram_name'),
      },
      tiktok: {
        url: readSafeUrl(tenant, 'footer_tiktok_url'),
        name: readString(tenant, 'footer_tiktok_name'),
      },
      twitter: {
        url: readSafeUrl(tenant, 'footer_twitter_url'),
        name: readString(tenant, 'footer_twitter_name'),
      },
      youtube: {
        url: readSafeUrl(tenant, 'footer_youtube_url'),
        name: readString(tenant, 'footer_youtube_name'),
      },
    },
    content: {
      aboutUs: readString(tenant, 'footer_about_us'),
      termsOfService: readString(tenant, 'footer_terms_of_service'),
      refundPolicy: readString(tenant, 'footer_refund_policy'),
      privacyPolicy: readString(tenant, 'footer_privacy_policy'),
    },
    copyrightText,
    showPoweredBy: tenant['footer_show_powered_by'] !== false,
    poweredByText,
    colors: getFooterColors(tenant),
  }
}

// ---------------------------------------------------------------------------
// Optional helpers
// ---------------------------------------------------------------------------

/**
 * True when the footer has at least one contact channel populated.
 */
export function footerHasContact(config: FooterConfig): boolean {
  const { address, phone, whatsapp, viber, email } = config.contact
  return Boolean(address || phone || whatsapp || viber || email)
}

/**
 * True when the footer has at least one social link populated.
 */
export function footerHasSocials(config: FooterConfig): boolean {
  const { facebook, instagram, tiktok, twitter, youtube } = config.socials
  return Boolean(
    facebook.url || instagram.url || tiktok.url || twitter.url || youtube.url,
  )
}

/**
 * The content pages that have non-empty content, in canonical order.
 */
export function footerVisibleContentPages(
  config: FooterConfig,
): typeof FOOTER_CONTENT_PAGES {
  return FOOTER_CONTENT_PAGES.filter(
    (page) => Boolean(config.content[page.key]),
  ) as unknown as typeof FOOTER_CONTENT_PAGES
}
