'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { CategorySubmenu } from '@/components/customer/category-submenu'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { MenuLayout } from '@/components/customer/layouts'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase/client'
import { getTenantBranding } from '@/lib/branding-utils'
import { BrandingEditorOverlay } from '@/components/admin/branding-editor-overlay'
import { toast } from 'sonner'
import type { Category, MenuItem, Tenant, PromotionBanner } from '@/types/database'
import type { CardTemplate } from '@/lib/card-templates'
import type { PageLayout } from '@/lib/page-layouts'

interface MenuClientProps {
  tenant: Tenant | null
  categories: Category[]
  allMenuItems: MenuItem[]
  tenantSlug: string
  error: string | null
}

export function MenuClient({ tenant, categories, allMenuItems, tenantSlug, error }: MenuClientProps) {
  const router = useRouter()
  const { addItem, items, setTenantContext } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    if (tenant) {
      setTenantContext(tenant.id, tenant.slug)
    }
  }, [tenant, setTenantContext])

  const filteredItems = useMemo(() => {
    let items = allMenuItems

    if (activeCategory) {
      items = items.filter((item) => item.category_id === activeCategory)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
      )
    }

    return items.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1
      if (!a.is_featured && b.is_featured) return 1
      return a.order - b.order
    })
  }, [allMenuItems, activeCategory, searchQuery])

  const baseBranding = getTenantBranding(tenant)
  const [brandingOverride, setBrandingOverride] = useState<Partial<Record<string, string>> | null>(null)
  const [heroOverride, setHeroOverride] = useState<{ title?: string; description?: string; heroTitleColor?: string; heroDescriptionColor?: string } | null>(null)
  const [bannerOverride, setBannerOverride] = useState<{
    announcementText?: string;
    announcementBgColor?: string;
    announcementTextColor?: string;
    isAnnouncementVisible?: boolean;
    promotionImageUrl?: string;
    isPromotionVisible?: boolean;
    promotionBanners?: PromotionBanner[];
  } | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [cardTemplateOverride, setCardTemplateOverride] = useState<string | null>(null)
  const [pageLayoutOverride, setPageLayoutOverride] = useState<string | null>(null)
  const [mobileGridColumnsOverride, setMobileGridColumnsOverride] = useState<number | null>(null)
  const branding = useMemo(() => {
    if (!brandingOverride) return baseBranding
    return { ...baseBranding, ...brandingOverride }
  }, [baseBranding, brandingOverride])

  function mapDraftToBranding(draft: Partial<Record<string, unknown>> | null): Partial<Record<string, string>> | null {
    if (!draft) return null
    const mapped: Record<string, string> = {}
    const setIf = (key: string, value: unknown) => { if (typeof value === 'string') mapped[key] = value }
    setIf('primary', draft.primary_color)
    setIf('secondary', draft.secondary_color)
    setIf('accent', draft.accent_color)
    setIf('background', draft.background_color)
    setIf('header', draft.header_color)
    setIf('headerFont', draft.header_font_color)
    setIf('cards', draft.cards_color)
    setIf('cardsBorder', draft.cards_border_color)
    setIf('cardTitle', draft.card_title_color)
    setIf('cardPrice', draft.card_price_color)
    setIf('cardDescription', draft.card_description_color)
    setIf('modalBackground', draft.modal_background_color)
    setIf('modalTitle', draft.modal_title_color)
    setIf('modalPrice', draft.modal_price_color)
    setIf('modalDescription', draft.modal_description_color)
    setIf('buttonPrimary', draft.button_primary_color)
    setIf('buttonPrimaryText', draft.button_primary_text_color)
    setIf('textPrimary', draft.text_primary_color)
    setIf('textSecondary', draft.text_secondary_color)
    setIf('textMuted', draft.text_muted_color)
    setIf('border', draft.border_color)
    setIf('success', draft.success_color)
    setIf('warning', draft.warning_color)
    setIf('error', draft.error_color)
    setIf('link', draft.link_color)
    setIf('shadow', draft.shadow_color)
    return mapped
  }

  function mapDraftToHero(draft: Partial<Record<string, unknown>> | null): { title?: string; description?: string; heroTitleColor?: string; heroDescriptionColor?: string } | null {
    if (!draft) return null
    return {
      title: typeof draft.hero_title === 'string' ? draft.hero_title : undefined,
      description: typeof draft.hero_description === 'string' ? draft.hero_description : undefined,
      heroTitleColor: typeof draft.hero_title_color === 'string' ? draft.hero_title_color : undefined,
      heroDescriptionColor: typeof draft.hero_description_color === 'string' ? draft.hero_description_color : undefined,
    }
  }

  function mapDraftToBanners(draft: Partial<Record<string, unknown>> | null): {
    announcementText?: string;
    announcementBgColor?: string;
    announcementTextColor?: string;
    isAnnouncementVisible?: boolean;
    promotionImageUrl?: string;
    isPromotionVisible?: boolean;
    promotionBanners?: PromotionBanner[];
  } | null {
    if (!draft) return null
    return {
      announcementText: typeof draft.announcement_text === 'string' ? draft.announcement_text : undefined,
      announcementBgColor: typeof draft.announcement_bg_color === 'string' ? draft.announcement_bg_color : undefined,
      announcementTextColor: typeof draft.announcement_text_color === 'string' ? draft.announcement_text_color : undefined,
      isAnnouncementVisible: typeof draft.is_announcement_visible === 'boolean' ? draft.is_announcement_visible : undefined,
      promotionImageUrl: typeof draft.promotion_image_url === 'string' ? draft.promotion_image_url : undefined,
      isPromotionVisible: typeof draft.is_promotion_visible === 'boolean' ? draft.is_promotion_visible : undefined,
      promotionBanners: Array.isArray(draft.promotion_banners) ? draft.promotion_banners as PromotionBanner[] : undefined,
    }
  }

  useEffect(() => {
    const promotionBanners = bannerOverride?.promotionBanners ?? tenant?.promotion_banners ?? []
    const isVisible = bannerOverride?.isPromotionVisible ?? tenant?.is_promotion_visible
    if (!isVisible || promotionBanners.length <= 1) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promotionBanners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [bannerOverride?.isPromotionVisible, bannerOverride?.promotionBanners, tenant?.is_promotion_visible, tenant?.promotion_banners])

  if (error === 'Restaurant not found') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: branding.background }}
      >
        <div className="text-center max-w-md mx-auto p-8">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">😞</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600 mb-6">
            The restaurant you&apos;re looking for doesn&apos;t exist or may have been removed.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: branding.buttonPrimary,
              color: branding.buttonPrimaryText
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (error === 'Failed to load menu data') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: branding.background }}
      >
        <div className="text-center max-w-md mx-auto p-8">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">😞</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600 mb-6">
            We&apos;re having trouble loading the menu. Please try again later.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: branding.buttonPrimary,
              color: branding.buttonPrimaryText
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: branding.background }}
    >
      {(bannerOverride?.isAnnouncementVisible ?? tenant?.is_announcement_visible) && (
        <div
          className="w-full text-center py-2 px-4 text-sm font-medium relative z-[51]"
          style={{
            backgroundColor: bannerOverride?.announcementBgColor || tenant?.announcement_bg_color || '#FFF4E5',
            color: bannerOverride?.announcementTextColor || tenant?.announcement_text_color || '#663C00'
          }}
        >
          {bannerOverride?.announcementText || tenant?.announcement_text || 'Welcome!'}
        </div>
      )}
      <header
        className="sticky top-0 z-50 w-full backdrop-blur-sm border-b"
        style={{
          backgroundColor: branding.header,
          color: branding.headerFont,
          borderColor: branding.border
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-3">
              {tenant?.logo_url ? (
                <div className="relative h-12 w-12 rounded-full overflow-hidden">
                  <OptimizedImage
                    src={tenant.logo_url}
                    alt={tenant.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: branding.primary }}
                >
                  <span className="text-lg font-bold text-white">
                    {tenant?.name?.charAt(0).toUpperCase() || tenantSlug.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h1
                  className="text-xl font-bold"
                  style={{ color: branding.textPrimary }}
                >
                  {tenant?.name || tenantSlug.replace(/-/g, ' ')}
                </h1>
                <p
                  className="text-xs"
                  style={{ color: branding.textMuted }}
                >
                  Smart Ordering Partner
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                className="flex items-center gap-2 text-sm transition-colors"
                style={{ color: branding.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.color = branding.primary}
                onMouseLeave={(e) => e.currentTarget.style.color = branding.textSecondary}
              >
                <span className="text-lg">📦</span>
                <span className="hidden sm:inline">Track Order</span>
              </button>
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 transition-colors"
                style={{ color: branding.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.color = branding.primary}
                onMouseLeave={(e) => e.currentTarget.style.color = branding.textSecondary}
              >
                <span className="text-xl">🛒</span>
                {items.length > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: branding.primary }}
                  >
                    {items.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {categories.length > 0 && (
        <CategorySubmenu
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          branding={branding}
        />
      )}

      {tenant && (
        <BrandingEditorOverlay
          tenant={tenant}
          onPreview={(draft) => {
            setBrandingOverride(mapDraftToBranding(draft))
            setHeroOverride(mapDraftToHero(draft as Partial<Record<string, unknown>> | null))
            setBannerOverride(mapDraftToBanners(draft as Partial<Record<string, unknown>> | null))
            setCardTemplateOverride(draft?.card_template as string || null)
            setPageLayoutOverride(draft?.page_layout as string || null)
            setMobileGridColumnsOverride(typeof draft?.mobile_grid_columns === 'number' ? draft.mobile_grid_columns : null)
          }}
          onSaved={async () => {
            if (!tenant?.id) return
            const supabase = createClient()
            const { data } = await supabase
              .from('tenants')
              .select('*')
              .eq('id', tenant.id)
              .maybeSingle()
            if (data) {
              window.location.reload()
              toast.success('Branding updated!')
            }
          }}
        />
      )}

      <main className="container mx-auto px-4 py-12">
        <MenuLayout
          layout={(pageLayoutOverride || tenant?.page_layout || 'default') as PageLayout}
          tenant={tenant}
          tenantSlug={tenantSlug}
          categories={categories}
          filteredItems={filteredItems}
          allMenuItems={allMenuItems}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onItemSelect={(item: MenuItem) => {
            const hasCustomizations =
              item.variations.length > 0 ||
              (item.variation_types && item.variation_types.length > 0) ||
              item.addons.length > 0
            if (!hasCustomizations) {
              addItem(
                item,
                undefined,
                [],
                1,
                undefined
              )
              toast.success(`Added ${item.name} to cart`)
            } else {
              router.push(`/${tenantSlug}/menu/item/${item.id}`)
            }
          }}
          branding={branding}
          cardTemplate={(cardTemplateOverride || tenant?.card_template || 'classic') as CardTemplate}
          isLoading={false}
          heroOverride={heroOverride}
          bannerOverride={{
            promotionBanners: bannerOverride?.promotionBanners,
            isPromotionVisible: bannerOverride?.isPromotionVisible,
          }}
          currentSlide={currentSlide}
          setCurrentSlide={setCurrentSlide}
          mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
        />
      </main>

      <ItemDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={addItem}
        branding={branding}
      />

      <CartDrawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        tenantSlug={tenantSlug}
        branding={branding}
      />
    </div>
  )
}
