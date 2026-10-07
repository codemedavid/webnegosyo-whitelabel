'use client'

/**
 * Shared building blocks for the menu header templates.
 * Keeping logo / title / cart / search in one place means every
 * header template renders identical, bug-free pieces and only differs in layout.
 */

import { useId } from 'react'
import { Search, ShoppingBag, ShoppingCart } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { useSeniorMode } from '@/components/customer/senior-mode/senior-mode-provider'
import { describeCartCount } from '@/lib/senior-mode'
import type { BrandingColors } from '@/lib/branding-utils'
import { DEFAULT_HEADER_CONFIG } from '@/lib/header-templates'
import type { HeaderCartStyle, HeaderConfig, HeaderLogoShape, HeaderHeight } from '@/lib/header-templates'
import type { Tenant } from '@/types/database'

/**
 * Legacy header edit zones. Kept only so `MenuHeaderRenderer` can accept (and
 * ignore) the old branding-editor props until all call sites stop passing them.
 */
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

/**
 * Branding Studio click-to-inspect tag — spread onto each template's root
 * <header> so the editor's inspector can highlight it and jump to the
 * Storefront → Header settings section (see src/lib/branding-inspect.ts).
 */
export const HEADER_SCOPE_PROPS = { 'data-branding-scope': 'storefront/header' } as const

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
      <div
        data-branding-scope="storefront/header-logo"
        className={`relative ${dim} flex-shrink-0 overflow-hidden ${radius}`}
      >
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
      data-branding-scope="storefront/header-logo"
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
      <h1
        data-branding-scope="storefront/header-title"
        className={`${titleSize} font-bold leading-tight truncate`}
        style={{ color: titleColor }}
      >
        {name}
      </h1>
      {tagline ? (
        <p
          data-branding-scope="storefront/header-tagline"
          className="mt-0.5 text-xs leading-tight sm:text-sm truncate"
          style={{ color: taglineColor }}
        >
          {tagline}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------- cart ------------------------------------ */

const CART_SCOPE_PROPS = { 'data-branding-scope': 'storefront/header-cart' } as const

interface CartStyleProps {
  itemCount: number
  onClick: () => void
  branding: BrandingColors
  /** Id of the screen-reader count that describes the button. */
  countId?: string
}

/**
 * The accessible name stays "Open cart"; the count rides along as the
 * description, because the `aria-label` hides the visible badge from screen readers.
 */
function CartCountDescription({ id, itemCount }: { id?: string; itemCount: number }) {
  if (!id) return null
  return (
    <span id={id} className="sr-only">
      {describeCartCount(itemCount)}
    </span>
  )
}

function formatCartCount(itemCount: number): string {
  return itemCount > 99 ? '99+' : String(itemCount)
}

/** Corner badge shared by the emoji and icon styles. */
function CornerCountBadge({ itemCount, branding, ringColor }: {
  itemCount: number
  branding: BrandingColors
  ringColor?: string
}) {
  if (itemCount <= 0) return null
  return (
    <span
      className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
      style={{
        backgroundColor: branding.menuCartBadgeBackground,
        color: branding.menuCartBadgeText,
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
      }}
    >
      {formatCartCount(itemCount)}
    </span>
  )
}

/** The original 🛒 — the default, so existing stores look unchanged. */
function EmojiCart({ itemCount, onClick, branding, countId }: CartStyleProps) {
  return (
    <button
      type="button"
      {...CART_SCOPE_PROPS}
      onClick={onClick}
      className="relative p-2 transition-colors hover:opacity-80"
      style={{ color: branding.textSecondary }}
      aria-label="Open cart"
      aria-describedby={countId}
    >
      <CartCountDescription id={countId} itemCount={itemCount} />
      <span className="text-xl">🛒</span>
      <CornerCountBadge itemCount={itemCount} branding={branding} />
    </button>
  )
}

/** Bag icon in a soft round chip tinted from the header's own text colour. */
function IconCart({ itemCount, onClick, branding, countId }: CartStyleProps) {
  return (
    <button
      type="button"
      {...CART_SCOPE_PROPS}
      onClick={onClick}
      className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
      style={{
        color: branding.menuMainHeaderText,
        backgroundColor: `color-mix(in srgb, ${branding.menuMainHeaderText} 10%, transparent)`,
      }}
      aria-label="Open cart"
      aria-describedby={countId}
    >
      <CartCountDescription id={countId} itemCount={itemCount} />
      <ShoppingBag className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
      <CornerCountBadge itemCount={itemCount} branding={branding} ringColor={branding.header} />
    </button>
  )
}

/** Filled brand pill that reads "Cart", with the count in an inverted chip. */
function PillCart({ itemCount, onClick, branding, countId }: CartStyleProps) {
  return (
    <button
      type="button"
      {...CART_SCOPE_PROPS}
      onClick={onClick}
      className="flex h-10 flex-shrink-0 items-center gap-2 rounded-full pl-3.5 pr-2 text-sm font-semibold shadow-sm transition-transform hover:brightness-105 active:scale-95"
      style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
      aria-label="Open cart"
      aria-describedby={countId}
    >
      <CartCountDescription id={countId} itemCount={itemCount} />
      <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
      <span className={itemCount > 0 ? '' : 'pr-1.5'}>Cart</span>
      {itemCount > 0 && (
        <span
          className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums"
          style={{ backgroundColor: branding.buttonPrimaryText, color: branding.buttonPrimary }}
        >
          {formatCartCount(itemCount)}
        </span>
      )}
    </button>
  )
}

/** Hairline pill: bag icon and the running count, always visible. */
function OutlineCart({ itemCount, onClick, branding, countId }: CartStyleProps) {
  return (
    <button
      type="button"
      {...CART_SCOPE_PROPS}
      onClick={onClick}
      className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-semibold tabular-nums transition-colors active:scale-95"
      style={{
        color: branding.menuMainHeaderText,
        borderColor: `color-mix(in srgb, ${branding.menuMainHeaderText} 28%, transparent)`,
      }}
      aria-label="Open cart"
      aria-describedby={countId}
    >
      <CartCountDescription id={countId} itemCount={itemCount} />
      <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
      {formatCartCount(itemCount)}
    </button>
  )
}

const CART_STYLE_COMPONENTS: Record<HeaderCartStyle, (props: CartStyleProps) => React.ReactElement> = {
  emoji: EmojiCart,
  icon: IconCart,
  pill: PillCart,
  outline: OutlineCart,
}

/** Senior mode: a filled, labelled "Cart" button — the bare emoji was the
 *  single most-missed control for older customers. Overrides every style. */
function SeniorCart({ itemCount, onClick, branding }: CartStyleProps) {
  return (
    <button
      type="button"
      {...CART_SCOPE_PROPS}
      onClick={onClick}
      className="flex min-h-12 flex-shrink-0 items-center gap-2 rounded-full px-4 text-base font-bold shadow-sm transition-transform active:scale-95"
      style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
      aria-label={`Open cart, ${describeCartCount(itemCount)}`}
    >
      <ShoppingCart className="h-6 w-6" aria-hidden="true" />
      Cart
      {itemCount > 0 && (
        <span
          className="flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm"
          style={{ backgroundColor: branding.buttonPrimaryText, color: branding.buttonPrimary }}
        >
          {formatCartCount(itemCount)}
        </span>
      )}
    </button>
  )
}

export function HeaderCartButton({
  cartStyle = DEFAULT_HEADER_CONFIG.cartStyle,
  ...props
}: CartStyleProps & { cartStyle?: HeaderCartStyle }) {
  const isSeniorMode = useSeniorMode()
  const countId = useId()
  if (isSeniorMode) return <SeniorCart {...props} />
  const StyledCart = CART_STYLE_COMPONENTS[cartStyle] ?? EmojiCart
  return <StyledCart {...props} countId={countId} />
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
