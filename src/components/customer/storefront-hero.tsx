'use client'

import type { ReactNode } from 'react'
import type { MenuItem, Tenant } from '@/types/database'
import type { HeroDesign } from '@/types/hero-designer'
import type { BrandingColors } from '@/lib/branding-utils'
import { HeroRenderer } from '@/components/customer/hero-renderer'
import { HeroPresetSection } from '@/components/customer/hero-preset'
import { resolveHeroPreset } from '@/lib/storefront-theme'
import { formatPrice } from '@/lib/cart-utils'

/**
 * The single source of truth for the storefront's simple hero, shared by every
 * page layout so a chosen hero_preset renders the same everywhere.
 *
 * Decision order (matches the design):
 *   1. Hero disabled            → nothing.
 *   2. v4 block-hero design     → nothing here (rendered at the page top level).
 *   3. Legacy hero_design       → HeroRenderer.
 *   4. A concrete hero_preset   → the rich HeroPresetSection.
 *   5. Otherwise (no explicit hero choice):
 *        - `children` given      → the layout's own plain hero (preserves its look);
 *        - `requireExplicit`     → nothing (sidebar/grid-focus stay hero-less);
 *        - else                  → a built-in plain title/description hero.
 */

interface HeroOverride {
  title?: string
  description?: string
  heroTitleColor?: string
  heroDescriptionColor?: string
}

interface StorefrontHeroProps {
  tenant: Tenant | null
  branding: BrandingColors
  allMenuItems?: MenuItem[]
  heroOverride?: HeroOverride | null
  /** Fallback title/description wording, kept per-layout. */
  defaultTitle?: string
  defaultDescription?: string
  /** Extra classes for the legacy HeroRenderer wrapper. */
  className?: string
  /**
   * When true, the plain title/description fallback (case 5) renders nothing —
   * so sidebar/grid-focus layouts stay hero-less unless a preset/design is set.
   */
  requireExplicit?: boolean
  /**
   * Opens the hero's featured product — pass the layout's own item-select
   * handler so the hero card behaves exactly like a menu card (adds bare items,
   * opens the sheet for customizable ones).
   */
  onSelectProduct?: (item: MenuItem) => void
  /** The layout's own plain hero, used only for the no-explicit-choice case. */
  children?: ReactNode
}

export function StorefrontHero({
  tenant,
  branding,
  allMenuItems,
  heroOverride,
  defaultTitle = 'Our Menu',
  defaultDescription = 'Your Smart Ordering Partner',
  className = 'mb-16',
  requireExplicit = false,
  onSelectProduct,
  children,
}: StorefrontHeroProps) {
  if (tenant?.hero_section_enabled === false) return null

  const heroDesign = tenant?.hero_design as Record<string, unknown> | null | undefined
  const hasHeroDesign = !!heroDesign && Object.keys(heroDesign).length > 0
  if (hasHeroDesign) {
    // v4 block heroes render at the page top level (BlockHeroRenderer); skip here
    // so we never double-render.
    if (heroDesign!.version === 4) return null
    return <HeroRenderer design={heroDesign as unknown as HeroDesign} className={className} />
  }

  const title = heroOverride?.title || tenant?.hero_title || defaultTitle
  const description = heroOverride?.description || tenant?.hero_description || defaultDescription
  const titleColor = heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary
  const descriptionColor =
    heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary

  const preset = resolveHeroPreset(tenant?.hero_preset)
  if (preset) {
    const featuredId = tenant?.hero_featured_product_id
    const featuredItem = featuredId ? allMenuItems?.find((item) => item.id === featuredId) : undefined
    const featuredProduct = featuredItem
      ? {
          name: featuredItem.name,
          priceLabel: formatPrice(featuredItem.discounted_price ?? featuredItem.price),
          imageUrl: featuredItem.image_url || null,
          onSelect: onSelectProduct ? () => onSelectProduct(featuredItem) : undefined,
        }
      : null
    const fallbackMedia = tenant?.hero_image_url
      ? { imageUrl: tenant.hero_image_url, linkUrl: tenant?.hero_link_url ?? null }
      : null
    const scrollToMenu = () => {
      if (typeof document === 'undefined') return
      document.getElementById('storefront-menu')?.scrollIntoView({ behavior: 'smooth' })
    }
    return (
      <HeroPresetSection
        preset={preset}
        title={title}
        description={description}
        titleColor={titleColor}
        descriptionColor={descriptionColor}
        accentColor={branding.accent || branding.primary}
        accentInkColor={branding.buttonPrimaryText}
        toneColor2={branding.primary}
        kicker={tenant?.hero_kicker || undefined}
        ctaPrimaryLabel={tenant?.hero_cta_primary_label || undefined}
        ctaSecondaryLabel={tenant?.hero_cta_secondary_label || undefined}
        onPrimaryCta={scrollToMenu}
        onSecondaryCta={scrollToMenu}
        featuredProduct={featuredProduct}
        fallbackMedia={fallbackMedia}
        brandInitial={(tenant?.name || title).trim().charAt(0)}
      />
    )
  }

  // No explicit hero choice.
  if (children !== undefined) return <>{children}</>
  if (requireExplicit) return null

  return (
    <div className="text-center mb-16">
      <div className="inline-flex items-center gap-2 justify-center">
        <h1 className="text-5xl font-serif font-bold mb-4" style={{ color: titleColor }}>
          {title}
        </h1>
      </div>
      <p className="text-lg font-light hidden md:block" style={{ color: descriptionColor }}>
        {description}
      </p>
    </div>
  )
}
