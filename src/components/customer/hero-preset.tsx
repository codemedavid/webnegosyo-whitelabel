import { Pencil } from 'lucide-react'
import type { HeroPreset } from '@/lib/storefront-theme'

/**
 * Storefront hero presets — six alternate layouts for the simple
 * title/description hero that renders when no advanced block-hero design is set.
 *
 * These faithfully reproduce the hero templates from the reference design
 * (Restaurant Storefront.dc.html): an uppercase kicker, one or two CTA buttons,
 * decorative accent-toned tiles carrying the brand initial, and — on the split
 * hero — a featured-product badge. Everything is additive: the presets are
 * opt-in (the default hero keeps its own markup) and every individual piece of
 * content (kicker, each CTA, featured product) only renders when it is set, so
 * a tenant that leaves them blank sees a clean title/description hero.
 *
 * All colors are passed in from the tenant's existing branding — nothing about
 * the palette is decided here.
 */

export interface HeroFeaturedProduct {
  name: string
  /** Pre-formatted price string, e.g. "₱320". */
  priceLabel: string
  /** Product image; when set the tile becomes a real product card. */
  imageUrl?: string | null
  /**
   * Opens the product — same behavior as selecting the menu item (adds a bare
   * item straight to cart, or opens the customization sheet). Both the card and
   * the Add button call this, so required variations are never skipped.
   */
  onSelect?: () => void
}

export interface HeroFallbackMedia {
  /** Raw image shown in the tile when no product is attached. */
  imageUrl: string
  /** Where the image links to when clicked (a product page path or any URL). */
  linkUrl?: string | null
}

/**
 * Only allow safe navigable schemes on the fallback image link. Blocks
 * `javascript:`/`data:` and other script-y schemes (react/security). Relative
 * paths (product pages like `/tenant/menu/item/id`) are always allowed.
 */
function safeHref(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.trim() === '') return undefined
  const trimmed = url.trim()
  if (trimmed.startsWith('/')) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return trimmed
  } catch {
    return undefined
  }
  return undefined
}

interface HeroPresetSectionProps {
  preset: Exclude<HeroPreset, 'theme'>
  title: string
  description: string
  titleColor: string
  descriptionColor: string
  accentColor: string
  /** Uppercase eyebrow label above the title. Hidden when blank. */
  kicker?: string
  /** Primary CTA label. The button is omitted when blank. */
  ctaPrimaryLabel?: string
  /** Secondary CTA label. The button is omitted when blank. */
  ctaSecondaryLabel?: string
  onPrimaryCta?: () => void
  onSecondaryCta?: () => void
  /** Featured product shown as a product card in the main hero tile. */
  featuredProduct?: HeroFeaturedProduct | null
  /** Fallback image + link used in the main hero tile when no product is set. */
  fallbackMedia?: HeroFallbackMedia | null
  /** Single character rendered inside the decorative tiles. */
  brandInitial?: string
  /** Readable text/ink color on top of the accent. Defaults to white. */
  accentInkColor?: string
  /** Tile background. Defaults to the accent color. */
  toneColor?: string
  /** Second tile background. Defaults to the title color (dark). */
  toneColor2?: string
  isBrandAdmin?: boolean
  onEdit?: () => void
}

function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      title="Edit hero section"
      aria-label="Edit hero section"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

function Kicker({ text, color }: { text?: string; color: string }) {
  if (!text) return null
  return (
    <div
      data-testid="hero-kicker"
      className="mb-4 text-xs font-bold uppercase tracking-[0.3em]"
      style={{ color }}
    >
      {text}
    </div>
  )
}

interface CtaProps {
  label?: string
  onClick?: () => void
  bg: string
  fg: string
  variant?: 'solid' | 'outline' | 'offset'
  borderColor?: string
}

function Cta({ label, onClick, bg, fg, variant = 'solid', borderColor }: CtaProps) {
  if (!label) return null
  const base =
    'inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-[0.08em] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
  if (variant === 'outline') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={base}
        style={{ background: 'transparent', color: fg, border: `1.5px solid ${borderColor ?? fg}` }}
      >
        {label}
      </button>
    )
  }
  if (variant === 'offset') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} hover:translate-x-[2px] hover:translate-y-[2px]`}
        style={{ background: bg, color: fg, boxShadow: `4px 4px 0 ${borderColor ?? '#1D1815'}` }}
      >
        {label}
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick} className={base} style={{ background: bg, color: fg }}>
      {label}
    </button>
  )
}

function Tile({ initial, tone, className = '' }: { initial: string; tone: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: tone }}
    >
      <span
        data-testid="hero-tile-initial"
        className="font-serif italic"
        style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(2.5rem, 8vw, 5rem)' }}
        aria-hidden
      >
        {initial}
      </span>
    </div>
  )
}

function FeaturedBadge({
  product,
  surface,
  textColor,
  accentColor,
}: {
  product: HeroFeaturedProduct
  surface: string
  textColor: string
  accentColor: string
}) {
  return (
    <div
      data-testid="hero-featured-product"
      className="absolute bottom-4 left-4 flex max-w-[80%] items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold shadow-lg"
      style={{ background: surface, color: textColor, border: `2px solid ${textColor}` }}
    >
      <span className="truncate">{product.name}</span>
      <span style={{ color: accentColor }}>{product.priceLabel}</span>
    </div>
  )
}

/**
 * The primary hero media tile. Decides, in order:
 *   1. featured product           → product card (image, price, Add, click-to-open)
 *   2. fallback image             → the image as a clickable link
 *   3. neither                    → the decorative brand-initial tile
 * Reused by the split/collage/centered presets so every template's main tile
 * can carry a highlighted product or image.
 */
function HeroMediaPanel({
  featuredProduct,
  fallbackMedia,
  initial,
  tone,
  className = '',
  badgeSurface,
  badgeTextColor,
  accentColor,
  accentInkColor,
}: {
  featuredProduct?: HeroFeaturedProduct | null
  fallbackMedia?: HeroFallbackMedia | null
  initial: string
  tone: string
  className?: string
  badgeSurface: string
  badgeTextColor: string
  accentColor: string
  accentInkColor: string
}) {
  if (featuredProduct) {
    const { name, priceLabel, imageUrl, onSelect } = featuredProduct
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ background: tone }}>
        {imageUrl ? (
          <button
            type="button"
            onClick={onSelect}
            aria-label={`View ${name}`}
            className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            aria-label={`View ${name}`}
            className="flex h-full w-full items-center justify-center"
          >
            <span
              data-testid="hero-tile-initial"
              className="font-serif italic"
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'clamp(2.5rem, 8vw, 5rem)' }}
              aria-hidden
            >
              {initial}
            </span>
          </button>
        )}
        <FeaturedBadge
          product={{ name, priceLabel }}
          surface={badgeSurface}
          textColor={badgeTextColor}
          accentColor={accentColor}
        />
        {onSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
            className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-extrabold shadow-lg transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: accentColor, color: accentInkColor }}
          >
            Add +
          </button>
        )}
      </div>
    )
  }

  const href = safeHref(fallbackMedia?.linkUrl)
  if (fallbackMedia?.imageUrl) {
    const image = (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={fallbackMedia.imageUrl}
        alt="Featured"
        className="h-full w-full object-cover"
        loading="lazy"
      />
    )
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ background: tone }}>
        {href ? (
          <a href={href} aria-label="Featured" className="block h-full w-full">
            {image}
          </a>
        ) : (
          image
        )}
      </div>
    )
  }

  return <Tile initial={initial} tone={tone} className={className} />
}

export function HeroPresetSection({
  preset,
  title,
  description,
  titleColor,
  descriptionColor,
  accentColor,
  kicker,
  ctaPrimaryLabel,
  ctaSecondaryLabel,
  onPrimaryCta,
  onSecondaryCta,
  featuredProduct,
  fallbackMedia,
  brandInitial,
  accentInkColor = '#ffffff',
  toneColor,
  toneColor2,
  isBrandAdmin = false,
  onEdit,
}: HeroPresetSectionProps) {
  const showEdit = isBrandAdmin && onEdit
  const edit = showEdit ? <EditButton onEdit={onEdit} /> : null
  const initial = (brandInitial || title.trim().charAt(0) || '•').toUpperCase()
  const tone = toneColor || accentColor
  const tone2 = toneColor2 || titleColor

  const primary = (
    <Cta label={ctaPrimaryLabel} onClick={onPrimaryCta} bg={accentColor} fg={accentInkColor} />
  )
  const secondaryOutline = (
    <Cta
      label={ctaSecondaryLabel}
      onClick={onSecondaryCta}
      bg="transparent"
      fg={titleColor}
      variant="outline"
      borderColor={accentColor}
    />
  )

  if (preset === 'editorial') {
    return (
      <div className="mb-16 text-center">
        <Kicker text={kicker} color={accentColor} />
        <div className="inline-flex items-start justify-center gap-2">
          <h1
            data-branding-scope="storefront/hero-title"
            className="font-serif font-bold leading-[1.05]"
            style={{ color: titleColor, fontSize: 'clamp(2.75rem, 7vw, 5.25rem)' }}
          >
            {title}
          </h1>
          {edit}
        </div>
        <div className="mx-auto my-8 h-px w-14" style={{ background: accentColor }} />
        <p
          data-branding-scope="storefront/hero-description"
          className="mx-auto mb-10 hidden max-w-xl text-lg font-light leading-relaxed md:block"
          style={{ color: descriptionColor }}
        >
          {description}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {primary}
          {secondaryOutline}
        </div>
      </div>
    )
  }

  if (preset === 'split') {
    return (
      <div className="mb-16 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          {kicker && (
            <div
              data-testid="hero-kicker"
              className="mb-5 inline-block rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em]"
              style={{ background: titleColor, color: accentInkColor }}
            >
              {kicker}
            </div>
          )}
          <div className="inline-flex items-start gap-2">
            <h1
              data-branding-scope="storefront/hero-title"
              className="font-serif font-bold uppercase leading-[0.98]"
              style={{ color: titleColor, fontSize: 'clamp(2.875rem, 7vw, 5.75rem)' }}
            >
              {title}
            </h1>
            {edit}
          </div>
          <p
            data-branding-scope="storefront/hero-description"
            className="mb-8 mt-6 hidden max-w-md text-lg font-light leading-relaxed md:block"
            style={{ color: descriptionColor }}
          >
            {description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Cta
              label={ctaPrimaryLabel}
              onClick={onPrimaryCta}
              bg={accentColor}
              fg={accentInkColor}
              variant="offset"
              borderColor={titleColor}
            />
          </div>
        </div>
        <div
          className="relative aspect-[4/4.4] rounded-3xl"
          style={{ border: `2px solid ${titleColor}` }}
        >
          <HeroMediaPanel
            featuredProduct={featuredProduct}
            fallbackMedia={fallbackMedia}
            initial={initial}
            tone={tone}
            className="h-full w-full rounded-3xl"
            badgeSurface="#ffffff"
            badgeTextColor={titleColor}
            accentColor={accentColor}
            accentInkColor={accentInkColor}
          />
        </div>
      </div>
    )
  }

  if (preset === 'banner') {
    return (
      <div
        className="mb-16 flex flex-wrap items-center gap-8 rounded-2xl px-8 py-11"
        style={{ background: accentColor, color: accentInkColor }}
      >
        <div className="min-w-[16rem] flex-1">
          {kicker && (
            <div
              data-testid="hero-kicker"
              className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.2em] opacity-80"
            >
              {kicker}
            </div>
          )}
          <div className="inline-flex items-start gap-2">
            <h1
              data-branding-scope="storefront/hero-title"
              className="mb-2.5 font-serif font-black leading-[1.05]"
              style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)' }}
            >
              {title}
            </h1>
            {edit}
          </div>
          <p
            data-branding-scope="storefront/hero-description"
            className="hidden text-base font-medium opacity-90 md:block"
          >
            {description}
          </p>
        </div>
        <div className="flex min-w-[13.75rem] flex-col gap-2.5">
          <Cta label={ctaPrimaryLabel} onClick={onPrimaryCta} bg="#ffffff" fg={accentColor} />
          <Cta
            label={ctaSecondaryLabel}
            onClick={onSecondaryCta}
            bg="rgba(255,255,255,0.16)"
            fg={accentInkColor}
            variant="outline"
            borderColor="rgba(255,255,255,0.5)"
          />
        </div>
      </div>
    )
  }

  if (preset === 'collage') {
    return (
      <div className="mb-16 grid items-center gap-10 md:grid-cols-2">
        <div>
          <Kicker text={kicker} color={accentColor} />
          <div className="inline-flex items-start gap-2">
            <h1
              data-branding-scope="storefront/hero-title"
              className="font-serif font-bold leading-[1.12]"
              style={{ color: titleColor, fontSize: 'clamp(2.5rem, 5.5vw, 4rem)' }}
            >
              {title}
            </h1>
            {edit}
          </div>
          <p
            data-branding-scope="storefront/hero-description"
            className="mb-8 mt-5 hidden max-w-md text-lg font-light leading-relaxed md:block"
            style={{ color: descriptionColor }}
          >
            {description}
          </p>
          <div className="flex flex-wrap gap-3">
            {primary}
            {secondaryOutline}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <HeroMediaPanel
            featuredProduct={featuredProduct}
            fallbackMedia={fallbackMedia}
            initial={initial}
            tone={tone}
            className="aspect-square rounded-3xl"
            badgeSurface="#ffffff"
            badgeTextColor={titleColor}
            accentColor={accentColor}
            accentInkColor={accentInkColor}
          />
          <Tile initial={initial} tone={tone2} className="mt-7 aspect-square rounded-3xl" />
        </div>
      </div>
    )
  }

  if (preset === 'minimal') {
    return (
      <div className="mb-16 max-w-2xl">
        <Kicker text={kicker} color={accentColor} />
        <div className="inline-flex items-start gap-2">
          <h1
            data-branding-scope="storefront/hero-title"
            className="font-sans font-extrabold uppercase leading-[1.1] tracking-[0.02em]"
            style={{ color: titleColor, fontSize: 'clamp(2.125rem, 4.5vw, 3.375rem)' }}
          >
            {title}
          </h1>
          {edit}
        </div>
        <p
          data-branding-scope="storefront/hero-description"
          className="mb-7 mt-4 hidden max-w-md text-base font-light leading-relaxed md:block"
          style={{ color: descriptionColor }}
        >
          {description}
        </p>
        <div className="flex flex-wrap gap-3">{primary}</div>
      </div>
    )
  }

  // 'centered' — big centered heading, single CTA, then a 3-tile image band.
  return (
    <div className="mb-16 text-center">
      <Kicker text={kicker} color={accentColor} />
      <div className="inline-flex items-start justify-center gap-2">
        <h1
          data-branding-scope="storefront/hero-title"
          className="mx-auto max-w-3xl font-sans font-extrabold leading-[1.05]"
          style={{ color: titleColor, fontSize: 'clamp(2.625rem, 6vw, 4.625rem)' }}
        >
          {title}
        </h1>
        {edit}
      </div>
      <p
        data-branding-scope="storefront/hero-description"
        className="mx-auto mb-8 mt-5 hidden max-w-lg text-lg font-light leading-relaxed md:block"
        style={{ color: descriptionColor }}
      >
        {description}
      </p>
      <div className="flex flex-wrap justify-center gap-3">{primary}</div>
      <div className="mt-12 grid grid-cols-3 items-end gap-4">
        <Tile initial={initial} tone={tone2} className="h-44 rounded-t-3xl" />
        <HeroMediaPanel
          featuredProduct={featuredProduct}
          fallbackMedia={fallbackMedia}
          initial={initial}
          tone={tone}
          className="h-56 rounded-t-3xl"
          badgeSurface="#ffffff"
          badgeTextColor={titleColor}
          accentColor={accentColor}
          accentInkColor={accentInkColor}
        />
        <Tile initial={initial} tone={tone2} className="h-44 rounded-t-3xl" />
      </div>
    </div>
  )
}
