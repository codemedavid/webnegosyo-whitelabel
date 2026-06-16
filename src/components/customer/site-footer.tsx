'use client'

/**
 * Customizable storefront footer.
 *
 * - `FooterView` is a pure presentational component driven entirely by a
 *   `FooterConfig` (and its resolved `colors`). It renders nothing when the
 *   footer is disabled. When `interactive` is false every interactive element
 *   (links) becomes a plain span — useful for admin previews.
 * - `SiteFooter` adapts a raw `Tenant` row into a `FooterConfig`, hides itself
 *   on admin/login routes, and renders the interactive view on the storefront.
 */

import type { CSSProperties, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import type { Tenant } from '@/types/database'
import {
  getFooterConfig,
  FOOTER_CONTENT_PAGES,
  type FooterConfig,
} from '@/lib/footer-utils'
import {
  MapPinIcon,
  PhoneIcon,
  WhatsappIcon,
  ViberIcon,
  MailIcon,
  FacebookIcon,
  InstagramIcon,
  TiktokIcon,
  XIcon,
  YoutubeIcon,
} from '@/components/customer/footer-icons'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip everything except digits and a leading + for tel/wa/viber targets. */
function toDialDigits(value: string): string {
  return value.replace(/[^\d+]/g, '')
}

interface CircleIconProps {
  colors: FooterConfig['colors']
  children: ReactNode
  size?: number
}

/** Filled colored circle with a contrasting glyph (uses `color` for the SVG). */
function CircleIcon({ colors, children, size = 36 }: CircleIconProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: colors.iconBackground,
    color: colors.icon,
    fontSize: Math.round(size * 0.5),
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={style}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// FooterView — pure presentational
// ---------------------------------------------------------------------------

interface FooterViewProps {
  config: FooterConfig
  interactive?: boolean
}

export function FooterView({ config, interactive = true }: FooterViewProps) {
  if (!config.enabled) return null

  const { colors, contact, socials, content } = config

  const linkStyle: CSSProperties = { color: colors.link }
  const mutedStyle: CSSProperties = { color: colors.muted }

  // Contact channels (only those that are set).
  const contactItems: Array<{
    key: string
    label: string
    href: string
    icon: ReactNode
  }> = []
  if (contact.phone) {
    contactItems.push({
      key: 'phone',
      label: contact.phone,
      href: `tel:${toDialDigits(contact.phone)}`,
      icon: <PhoneIcon />,
    })
  }
  if (contact.whatsapp) {
    contactItems.push({
      key: 'whatsapp',
      label: contact.whatsapp,
      href: `https://wa.me/${toDialDigits(contact.whatsapp).replace(/\+/g, '')}`,
      icon: <WhatsappIcon />,
    })
  }
  if (contact.viber) {
    contactItems.push({
      key: 'viber',
      label: contact.viber,
      href: `viber://chat?number=${toDialDigits(contact.viber)}`,
      icon: <ViberIcon />,
    })
  }
  if (contact.email) {
    contactItems.push({
      key: 'email',
      label: contact.email,
      href: `mailto:${contact.email}`,
      icon: <MailIcon />,
    })
  }

  // Content page links (only those with non-empty content).
  const contentLinks = FOOTER_CONTENT_PAGES.filter((page) =>
    Boolean(content[page.key]),
  )

  // Social links (only those that are set). Each shows the admin-provided name,
  // falling back to the platform name when no label is given.
  const socialItems: Array<{
    key: string
    label: string
    href: string
    icon: ReactNode
  }> = []
  if (socials.facebook.url)
    socialItems.push({ key: 'facebook', label: socials.facebook.name || 'Facebook', href: socials.facebook.url, icon: <FacebookIcon /> })
  if (socials.instagram.url)
    socialItems.push({ key: 'instagram', label: socials.instagram.name || 'Instagram', href: socials.instagram.url, icon: <InstagramIcon /> })
  if (socials.tiktok.url)
    socialItems.push({ key: 'tiktok', label: socials.tiktok.name || 'TikTok', href: socials.tiktok.url, icon: <TiktokIcon /> })
  if (socials.twitter.url)
    socialItems.push({ key: 'twitter', label: socials.twitter.name || 'Twitter / X', href: socials.twitter.url, icon: <XIcon /> })
  if (socials.youtube.url)
    socialItems.push({ key: 'youtube', label: socials.youtube.name || 'YouTube', href: socials.youtube.url, icon: <YoutubeIcon /> })

  return (
    <footer
      style={{ backgroundColor: colors.background, color: colors.text }}
      className="w-full"
    >
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-12">
        {/* Top: logo + business name + tagline */}
        <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
          {config.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.logoUrl}
              alt={config.businessName || 'Logo'}
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl object-cover"
            />
          ) : null}
          {config.businessName ? (
            <p className="text-lg font-bold" style={{ color: colors.heading }}>
              {config.businessName}
            </p>
          ) : null}
          {config.tagline ? (
            <p className="max-w-md text-sm" style={mutedStyle}>
              {config.tagline}
            </p>
          ) : null}
        </div>

        {/* Address row */}
        {contact.address ? (
          <div className="mt-6 flex items-center justify-center gap-3 sm:justify-start">
            <CircleIcon colors={colors}>
              <MapPinIcon />
            </CircleIcon>
            <span className="text-sm" style={{ color: colors.text }}>
              {contact.address}
            </span>
          </div>
        ) : null}

        {/* Contact row — two per row on larger screens */}
        {contactItems.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {contactItems.map((item) => {
              const inner = (
                <>
                  <CircleIcon colors={colors}>{item.icon}</CircleIcon>
                  <span className="truncate text-sm font-medium" style={{ color: colors.text }}>
                    {item.label}
                  </span>
                </>
              )
              return interactive ? (
                <a
                  key={item.key}
                  href={item.href}
                  className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                  {inner}
                </a>
              ) : (
                <span key={item.key} className="flex min-w-0 items-center gap-2.5">
                  {inner}
                </span>
              )
            })}
          </div>
        ) : null}

        {/* Content page links */}
        {contentLinks.length > 0 ? (
          <nav className="mt-8 flex flex-col items-center gap-3 sm:items-start">
            {contentLinks.map((page) =>
              interactive ? (
                <a
                  key={page.slug}
                  href={`/${page.slug}`}
                  className="text-sm font-bold transition-opacity hover:opacity-80"
                  style={linkStyle}
                >
                  {page.title}
                </a>
              ) : (
                <span
                  key={page.slug}
                  className="text-sm font-bold"
                  style={linkStyle}
                >
                  {page.title}
                </span>
              ),
            )}
          </nav>
        ) : null}

        {/* Social row — two per row on larger screens, with names */}
        {socialItems.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {socialItems.map((item) => {
              const inner = (
                <>
                  <CircleIcon colors={colors}>{item.icon}</CircleIcon>
                  <span className="truncate text-sm font-medium" style={{ color: colors.text }}>
                    {item.label}
                  </span>
                </>
              )
              return interactive ? (
                <a
                  key={item.key}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                  {inner}
                </a>
              ) : (
                <span key={item.key} aria-label={item.label} className="flex min-w-0 items-center gap-2.5">
                  {inner}
                </span>
              )
            })}
          </div>
        ) : null}

        {/* Bottom row */}
        <div
          className="mt-8 flex flex-col items-center justify-between gap-2 border-t pt-6 text-xs sm:flex-row"
          style={{ borderColor: colors.border }}
        >
          <span style={mutedStyle}>{config.copyrightText}</span>
          {config.showPoweredBy ? (
            <span style={mutedStyle}>
              {renderPoweredBy(config.poweredByText, colors.link)}
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  )
}

/** Render the powered-by text, emphasizing the word "WebNegosyo" in link color. */
function renderPoweredBy(text: string, linkColor: string): ReactNode {
  const brand = 'WebNegosyo'
  const index = text.indexOf(brand)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <span className="font-semibold" style={{ color: linkColor }}>
        {brand}
      </span>
      {text.slice(index + brand.length)}
    </>
  )
}

// ---------------------------------------------------------------------------
// SiteFooter — tenant-aware wrapper
// ---------------------------------------------------------------------------

interface SiteFooterProps {
  tenant: Tenant | null
}

export function SiteFooter({ tenant }: SiteFooterProps) {
  const pathname = usePathname()

  // Nothing to render without a resolved tenant (e.g. not-found routes).
  if (!tenant) {
    return null
  }

  // Hide on tenant admin and login routes.
  if (pathname && (pathname.includes('/admin') || pathname.includes('/login'))) {
    return null
  }

  const config = getFooterConfig(tenant as unknown as Record<string, unknown>)
  return <FooterView config={config} interactive />
}
