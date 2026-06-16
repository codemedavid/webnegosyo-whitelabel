'use client'

/**
 * Shared building blocks for the menu header templates.
 * Keeping logo / title / cart / search / pencil in one place means every
 * header template renders identical, bug-free pieces and only differs in layout.
 */

import { Pencil, Search } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { BrandingColors } from '@/lib/branding-utils'
import type { HeaderConfig, HeaderLogoShape, HeaderHeight } from '@/lib/header-templates'
import type { Tenant } from '@/types/database'

/** The two header zones an admin can jump to from a pencil button. */
export type HeaderEditSection = 'main_header' | 'cart_badge'

export interface HeaderTemplateProps {
  tenant: Tenant | null
  tenantSlug: string
  branding: BrandingColors
  config: HeaderConfig
  itemCount: number
  onCartClick: () => void
  searchQuery: string
  onSearchChange: (value: string) => void
  isBrandAdmin: boolean
  onEditSection: (section: HeaderEditSection) => void
  /**
   * Extra classes applied to the <header> element itself (NOT a wrapper) so
   * responsive visibility (e.g. "hidden md:block") can be toggled without
   * breaking position: sticky — a sticky element must remain a direct child
   * of the scrolling page, never nested in a short wrapper div.
   */
  className?: string
}

type ElementSize = 'sm' | 'md' | 'lg'

/* ----------------------------- shell helpers ----------------------------- */

export function headerShellClass(config: HeaderConfig, extra?: string): string {
  return [
    config.sticky ? 'sticky top-0' : 'relative',
    'z-50 w-full border-b',
    config.blur ? 'backdrop-blur-sm' : '',
    config.shadow ? 'shadow-md' : '',
    extra || '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function headerShellStyle(branding: BrandingColors): React.CSSProperties {
  return {
    backgroundColor: branding.header,
    color: branding.headerFont,
    borderColor: branding.border,
  }
}

export function rowHeightClass(height: HeaderHeight): string {
  if (height === 'compact') return 'h-16'
  if (height === 'tall') return 'h-28'
  return 'h-20'
}

function logoRadiusClass(shape: HeaderLogoShape): string {
  if (shape === 'square') return 'rounded-none'
  if (shape === 'rounded') return 'rounded-xl'
  return 'rounded-full'
}

/* -------------------------------- logo ----------------------------------- */

export function HeaderLogo({
  tenant,
  tenantSlug,
  branding,
  shape,
  size = 'md',
}: {
  tenant: Tenant | null
  tenantSlug: string
  branding: BrandingColors
  shape: HeaderLogoShape
  size?: ElementSize
}) {
  const dim = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-16 w-16' : 'h-12 w-12'
  const sizes = size === 'sm' ? '36px' : size === 'lg' ? '64px' : '48px'
  const radius = logoRadiusClass(shape)
  const initial = (tenant?.name?.charAt(0) || tenantSlug.charAt(0) || '?').toUpperCase()

  if (tenant?.logo_url) {
    return (
      <div className={`relative ${dim} flex-shrink-0 overflow-hidden ${radius}`}>
        <OptimizedImage
          src={tenant.logo_url}
          alt={tenant.name || 'Logo'}
          fill
          className="object-cover"
          sizes={sizes}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex ${dim} flex-shrink-0 items-center justify-center ${radius}`}
      style={{ backgroundColor: branding.primary }}
    >
      <span className={`font-bold text-white ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
        {initial}
      </span>
    </div>
  )
}

/* -------------------------------- title ---------------------------------- */

export function HeaderTitle({
  name,
  tagline,
  taglineColor,
  titleColor,
  align = 'left',
  size = 'md',
}: {
  name: string
  tagline?: string
  taglineColor: string
  titleColor: string
  align?: 'left' | 'center'
  size?: ElementSize
}) {
  const titleSize =
    size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'sm' ? 'text-base' : 'text-xl'

  return (
    <div className={`min-w-0 ${align === 'center' ? 'text-center' : ''}`}>
      <h1 className={`${titleSize} font-bold leading-tight truncate`} style={{ color: titleColor }}>
        {name}
      </h1>
      {tagline ? (
        <p className="mt-0.5 text-xs leading-tight sm:text-sm truncate" style={{ color: taglineColor }}>
          {tagline}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------- cart ------------------------------------ */

export function HeaderCartButton({
  itemCount,
  onClick,
  branding,
}: {
  itemCount: number
  onClick: () => void
  branding: BrandingColors
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative p-2 transition-colors hover:opacity-80"
      style={{ color: branding.textSecondary }}
      aria-label="Open cart"
    >
      <span className="text-xl">🛒</span>
      {itemCount > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
          style={{
            backgroundColor: branding.menuCartBadgeBackground,
            color: branding.menuCartBadgeText,
          }}
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}

/* ------------------------------ search ----------------------------------- */

export function HeaderSearch({
  value,
  onChange,
  branding,
  placeholder = 'Search the menu…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  branding: BrandingColors
  placeholder?: string
  className?: string
}) {
  const sb = branding.searchBar
  const radius =
    sb.radius === 'square' ? 'rounded-md' : sb.radius === 'rounded' ? 'rounded-lg' : 'rounded-full'

  // Ghost/outline styles get a transparent fill; filled gets a soft grey by default.
  const background =
    sb.style === 'filled' ? sb.background || '#f3f4f6' : 'transparent'
  const borderColor =
    sb.style === 'outline'
      ? sb.border || branding.border
      : sb.style === 'ghost'
        ? 'transparent'
        : sb.border || 'transparent'

  return (
    <div className={`relative w-full ${className || ''}`}>
      {/* A real SVG icon (not an emoji) so the configured icon color actually applies. */}
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: sb.icon || branding.textMuted }}
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search the menu"
        className={`branded-search-input w-full border py-2 pl-9 pr-3 text-sm outline-none ${radius}`}
        style={{
          backgroundColor: background,
          color: sb.text || branding.textPrimary,
          borderColor,
          // CSS var consumed by .branded-search-input::placeholder (globals.css) so the
          // configured placeholder color (and contrast) is honored on branded backgrounds.
          // @ts-expect-error -- CSS custom property via inline style
          '--branded-placeholder-color': sb.placeholder || branding.textMuted,
        }}
      />
    </div>
  )
}

/* ----------------------------- admin pencil ------------------------------ */

export function HeaderAdminPencil({
  visible,
  onClick,
  label,
  className,
}: {
  visible: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900 ${className || ''}`}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}
