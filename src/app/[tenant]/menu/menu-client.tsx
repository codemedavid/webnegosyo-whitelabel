'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { CategorySubmenu } from '@/components/customer/category-submenu'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { MenuLayout } from '@/components/customer/layouts'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding } from '@/lib/branding-utils'
import { toast } from 'sonner'
import type { Category, MenuItem, Tenant, PromotionBanner } from '@/types/database'
import type { CardTemplate } from '@/lib/card-templates'
import type { PageLayout } from '@/lib/page-layouts'
import type { BundleWithSlots } from '@/types/database'
import { bundleToMenuItem, isBundleMenuItem } from '@/lib/bundle-adapter'

interface MenuClientProps {
  tenant: Tenant | null
  categories: Category[]
  allMenuItems: MenuItem[]
  bundles: BundleWithSlots[]
  tenantSlug: string
  isBrandAdmin: boolean
  error: string | null
}

type MenuBrandingSection = 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards'

interface AdminEditPencilProps {
  visible: boolean
  onClick: () => void
  label: string
  className?: string
}

const BrandingEditorOverlay = dynamic(
  () => import('@/components/admin/branding-editor-overlay').then(mod => ({ default: mod.BrandingEditorOverlay })),
  { ssr: false }
)

// Heavy modals — loaded lazily since they are not visible on initial render.
const CheckoutUpsellModal = dynamic(
  () => import('@/components/customer/checkout-upsell-modal').then(mod => ({ default: mod.CheckoutUpsellModal })),
  { ssr: false }
)
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)


function AdminEditPencil({ visible, onClick, label, className }: AdminEditPencilProps) {
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900 ${className || ''}`}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

export function MenuClient({ tenant, categories, allMenuItems, bundles, tenantSlug, isBrandAdmin, error }: MenuClientProps) {
  const router = useRouter()
  const { addItem, item_count, setTenantContext } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value)
    }, 200)
  }, [])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<BundleWithSlots | null>(null)
  const flashScreenEnabled = Boolean(tenant?.flash_screen_feature_enabled && tenant?.flash_screen_is_active)
  const [showFlashScreen, setShowFlashScreen] = useState(flashScreenEnabled)

  useEffect(() => {
    if (tenant) {
      setTenantContext(tenant.id, tenant.slug)
    }
  }, [tenant, setTenantContext])

  useEffect(() => {
    if (!flashScreenEnabled) {
      setShowFlashScreen(false)
      return
    }

    try {
      const storageKey = `flash-screen-seen:${tenant?.id ?? tenantSlug}`
      const hasSeenFlash = window.sessionStorage.getItem(storageKey) === '1'
      if (hasSeenFlash) {
        setShowFlashScreen(false)
        return
      }

      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // Ignore storage errors (private browsing, blocked storage, etc.)
    }

    setShowFlashScreen(true)
    const durationMsRaw = tenant?.flash_screen_duration_ms ?? 2000
    const durationMs = Math.min(15000, Math.max(500, durationMsRaw))
    const timer = window.setTimeout(() => {
      setShowFlashScreen(false)
    }, durationMs)

    return () => window.clearTimeout(timer)
  }, [flashScreenEnabled, tenant?.flash_screen_duration_ms, tenant?.id, tenantSlug])

  // Virtual "Bundles" category + adapted bundle items
  const { categoriesWithBundles, allItemsWithBundles } = useMemo(() => {
    if (bundles.length === 0) {
      return { categoriesWithBundles: categories, allItemsWithBundles: allMenuItems }
    }

    const bundleCategory: Category = {
      id: 'bundles',
      tenant_id: tenant?.id ?? '',
      name: 'Bundles',
      description: 'Special bundle deals',
      order: -1,
      is_active: true,
      display_layout: 'grid' as const,
      created_at: '',
      updated_at: '',
    }

    const bundleMenuItems = bundles.map(bundleToMenuItem)

    return {
      categoriesWithBundles: [bundleCategory, ...categories],
      allItemsWithBundles: [...bundleMenuItems, ...allMenuItems],
    }
  }, [bundles, categories, allMenuItems, tenant?.id])

  const filteredItems = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    const items = allItemsWithBundles.filter((item) => {
      if (activeCategory && item.category_id !== activeCategory) {
        return false
      }

      if (!query) {
        return true
      }

      return (
        item.name.toLowerCase().includes(query) ||
        (item.description ?? '').toLowerCase().includes(query)
      )
    })

    return [...items].sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1
      if (!a.is_featured && b.is_featured) return 1
      if (tenant?.menu_engineering_enabled) {
        const aIsStar = a.bcg_classification === 'star'
        const bIsStar = b.bcg_classification === 'star'
        if (aIsStar && !bIsStar) return -1
        if (!aIsStar && bIsStar) return 1
      }
      return a.order - b.order
    })
  }, [allItemsWithBundles, activeCategory, debouncedSearchQuery, tenant?.menu_engineering_enabled])

  const baseBranding = useMemo(() => getTenantBranding(tenant), [tenant])
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
  const [mobilePageLayoutOverride, setMobilePageLayoutOverride] = useState<string | null>(null)
  const [mobileCardTemplateOverride, setMobileCardTemplateOverride] = useState<string | null>(null)
  const [isCheckoutPreviewOpen, setIsCheckoutPreviewOpen] = useState(false)
  const branding = useMemo(() => {
    if (!brandingOverride) return baseBranding
    return { ...baseBranding, ...brandingOverride }
  }, [baseBranding, brandingOverride])

  // Memoize banner props to avoid creating new object literals on every render,
  // which would force child components (MenuLayout, CategorySubmenu) to re-render.
  const bannerPropsOverride = useMemo(() => ({
    promotionBanners: bannerOverride?.promotionBanners,
    isPromotionVisible: bannerOverride?.isPromotionVisible,
  }), [bannerOverride?.promotionBanners, bannerOverride?.isPromotionVisible])

  // Stable callback: prevents entire card grid from re-rendering on unrelated state changes
  const handleItemSelect = useCallback((item: MenuItem) => {
    if (isBundleMenuItem(item)) {
      setSelectedBundle(item._bundleData)
      return
    }
    const hasCustomizations =
      item.variations.length > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      item.addons.length > 0
    if (!hasCustomizations && !tenant?.menu_engineering_enabled) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else {
      router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
    }
  }, [tenant?.menu_engineering_enabled, addItem, router, tenantSlug])

  const desktopLayout = (pageLayoutOverride || tenant?.page_layout || 'default') as PageLayout
  const mobileLayout = (mobilePageLayoutOverride ?? tenant?.mobile_page_layout ?? desktopLayout) as PageLayout
  const desktopCard = (cardTemplateOverride || tenant?.card_template || 'classic') as CardTemplate
  const mobileCard = (mobileCardTemplateOverride ?? tenant?.mobile_card_template ?? desktopCard) as CardTemplate
  const needsDualRender = mobileLayout !== desktopLayout || mobileCard !== desktopCard

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
    setIf('checkoutModalBackground', draft.checkout_modal_background_color)
    setIf('checkoutModalTitle', draft.checkout_modal_title_color)
    setIf('checkoutModalDescription', draft.checkout_modal_description_color)
    setIf('checkoutModalPrice', draft.checkout_modal_price_color)
    setIf('checkoutModalButton', draft.checkout_modal_button_color)
    setIf('checkoutModalButtonText', draft.checkout_modal_button_text_color)
    setIf('checkoutModalBorder', draft.checkout_modal_border_color)
    setIf('buttonPrimary', draft.button_primary_color)
    setIf('buttonPrimaryText', draft.button_primary_text_color)
    setIf('buttonSecondary', draft.button_secondary_color)
    setIf('buttonSecondaryText', draft.button_secondary_text_color)
    setIf('textPrimary', draft.text_primary_color)
    setIf('textSecondary', draft.text_secondary_color)
    setIf('textMuted', draft.text_muted_color)
    setIf('menuMainHeaderText', draft.menu_main_header_text_color)
    setIf('menuMainHeaderSubtitle', draft.menu_main_header_subtitle_color)
    setIf('menuCategoryHeader', draft.menu_category_header_color)
    setIf('menuCategoryActive', draft.menu_category_active_color)
    setIf('menuCategoryInactive', draft.menu_category_inactive_color)
    setIf('menuCartBadgeBackground', draft.menu_cart_badge_background_color)
    setIf('menuCartBadgeText', draft.menu_cart_badge_text_color)
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

  function openBrandingEditor(section: MenuBrandingSection) {
    window.dispatchEvent(new CustomEvent('menu-branding-editor:open', { detail: { section } }))
  }

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
      {showFlashScreen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-6"
          style={{
            backgroundColor: tenant?.flash_screen_background_color || '#111111',
            color: tenant?.flash_screen_text_color || '#ffffff',
          }}
        >
          <div className="flex w-full max-w-sm flex-col items-center text-center">
            {(tenant?.flash_screen_image_url || tenant?.logo_url) ? (
              <div className="mb-6 h-24 w-24 overflow-hidden rounded-full border border-white/20 bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tenant?.flash_screen_image_url || tenant?.logo_url || ''}
                  alt={tenant?.name || 'Brand logo'}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-bold">
                {tenant?.name?.charAt(0).toUpperCase() || tenantSlug.charAt(0).toUpperCase()}
              </div>
            )}

            <h2 className="text-2xl font-semibold">
              {tenant?.flash_screen_title || 'Loading menu...'}
            </h2>

            {tenant?.flash_screen_subtitle && (
              <p className="mt-2 text-sm opacity-90">{tenant.flash_screen_subtitle}</p>
            )}

            <div
              className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-label="Loading"
            />
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-2">
                <div>
                  <h1
                    className="text-xl font-bold"
                    style={{ color: branding.menuMainHeaderText }}
                  >
                    {tenant?.name || tenantSlug.replace(/-/g, ' ')}
                  </h1>
                </div>
                <AdminEditPencil
                  visible={isBrandAdmin}
                  onClick={() => openBrandingEditor('main_header')}
                  label="Edit main header colors"
                  className="mt-0.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 transition-colors hover:opacity-80"
                style={{ color: branding.textSecondary }}
              >
                <span className="text-xl">🛒</span>
                {item_count > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: branding.menuCartBadgeBackground,
                      color: branding.menuCartBadgeText,
                    }}
                  >
                    {item_count > 99 ? '99+' : item_count}
                  </span>
                )}
              </button>
              <AdminEditPencil
                visible={isBrandAdmin}
                onClick={() => openBrandingEditor('cart_badge')}
                label="Edit cart badge colors"
              />
            </div>
          </div>
        </div>
      </header>

      {categoriesWithBundles.length > 0 && (
        needsDualRender ? (
          <>
            {desktopLayout === 'default' && (
              <div className="hidden md:block">
                <CategorySubmenu
                  categories={categoriesWithBundles}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  branding={branding}
                  isBrandAdmin={isBrandAdmin}
                  onEditBrandingSection={() => openBrandingEditor('category_navigation')}
                />
              </div>
            )}
            {mobileLayout === 'default' && (
              <div className="md:hidden">
                <CategorySubmenu
                  categories={categoriesWithBundles}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  branding={branding}
                  isBrandAdmin={isBrandAdmin}
                  onEditBrandingSection={() => openBrandingEditor('category_navigation')}
                />
              </div>
            )}
          </>
        ) : desktopLayout === 'default' ? (
          <CategorySubmenu
            categories={categoriesWithBundles}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            branding={branding}
            isBrandAdmin={isBrandAdmin}
            onEditBrandingSection={() => openBrandingEditor('category_navigation')}
          />
        ) : null
      )}

      {tenant && isBrandAdmin && (
        <BrandingEditorOverlay
          tenant={tenant}
          onPreview={(draft) => {
            setBrandingOverride(mapDraftToBranding(draft))
            setHeroOverride(mapDraftToHero(draft as Partial<Record<string, unknown>> | null))
            setBannerOverride(mapDraftToBanners(draft as Partial<Record<string, unknown>> | null))
            setCardTemplateOverride(draft?.card_template as string || null)
            setPageLayoutOverride(draft?.page_layout as string || null)
            setMobileGridColumnsOverride(typeof draft?.mobile_grid_columns === 'number' ? draft.mobile_grid_columns : null)
            setMobilePageLayoutOverride(draft?.mobile_page_layout as string || null)
            setMobileCardTemplateOverride(draft?.mobile_card_template as string || null)
          }}
          onSaved={(result) => {
            if (result?.warning) {
              toast.warning(result.warning)
            } else {
              toast.success('Branding updated!')
            }
            // Refresh server props so the client gets the saved tenant data
            router.refresh()
          }}
          onToggleCheckoutPreview={() => setIsCheckoutPreviewOpen(prev => !prev)}
        />
      )}

      <main className={
        tenant?.hero_section_enabled !== false && tenant?.hero_design && (tenant.hero_design as Record<string, unknown>).layoutMode === 'fullscreen'
          ? 'container mx-auto px-4 pb-12'
          : 'container mx-auto px-4 py-12'
      }>
        {needsDualRender ? (
          <>
            <div className="md:hidden">
              <MenuLayout
                layout={mobileLayout}
                tenant={tenant}
                tenantSlug={tenantSlug}
                categories={categoriesWithBundles}
                filteredItems={filteredItems}
                allMenuItems={allMenuItems}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                searchQuery={searchQuery}
                setSearchQuery={handleSearchChange}
                onItemSelect={handleItemSelect}
                branding={branding}
                cardTemplate={mobileCard}
                isLoading={false}
                heroOverride={heroOverride}
                bannerOverride={bannerPropsOverride}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
                menuEngineeringEnabled={tenant?.menu_engineering_enabled}
                hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
                isBrandAdmin={isBrandAdmin}
                onOpenBrandingSection={openBrandingEditor}
              />
            </div>
            <div className="hidden md:block">
              <MenuLayout
                layout={desktopLayout}
                tenant={tenant}
                tenantSlug={tenantSlug}
                categories={categoriesWithBundles}
                filteredItems={filteredItems}
                allMenuItems={allMenuItems}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                searchQuery={searchQuery}
                setSearchQuery={handleSearchChange}
                onItemSelect={handleItemSelect}
                branding={branding}
                cardTemplate={desktopCard}
                isLoading={false}
                heroOverride={heroOverride}
                bannerOverride={bannerPropsOverride}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
                menuEngineeringEnabled={tenant?.menu_engineering_enabled}
                hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
                isBrandAdmin={isBrandAdmin}
                onOpenBrandingSection={openBrandingEditor}
              />
            </div>
          </>
        ) : (
          <MenuLayout
            layout={desktopLayout}
            tenant={tenant}
            tenantSlug={tenantSlug}
            categories={categoriesWithBundles}
            filteredItems={filteredItems}
            allMenuItems={allMenuItems}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            searchQuery={searchQuery}
            setSearchQuery={handleSearchChange}
            onItemSelect={handleItemSelect}
            branding={branding}
            cardTemplate={desktopCard}
            isLoading={false}
            heroOverride={heroOverride}
            bannerOverride={bannerPropsOverride}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
            menuEngineeringEnabled={tenant?.menu_engineering_enabled}
            hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
            isBrandAdmin={isBrandAdmin}
            onOpenBrandingSection={openBrandingEditor}
          />
        )}
      </main>



      <CartDrawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        tenantSlug={tenantSlug}
        branding={branding}
        tenantId={tenant?.id}
        menuEngineeringEnabled={tenant?.menu_engineering_enabled}
        checkoutUpsellEnabled={tenant?.checkout_upsell_enabled}
        checkoutUpsellTitle={tenant?.checkout_upsell_title}
        checkoutUpsellSubtitle={tenant?.checkout_upsell_subtitle}
        checkoutUpsellMaxItems={tenant?.checkout_upsell_max_items}
      />

      {/* Checkout Interstitial Preview (admin only, z-[61] above branding editor z-[60]) */}
      {tenant && isBrandAdmin && (
        <CheckoutUpsellModal
          open={isCheckoutPreviewOpen}
          onContinue={() => setIsCheckoutPreviewOpen(false)}
          tenantId={tenant.id}
          branding={branding}
          title={tenant.checkout_upsell_title || 'Before you go...'}
          subtitle={tenant.checkout_upsell_subtitle || 'You might also enjoy these items'}
          maxItems={4}
          previewSuggestions={allMenuItems.slice(0, 3).map(item => ({
            ...item,
            category_id: item.category_id || '',
          }))}
          zIndexClass="z-[61]"
        />
      )}

      {/* Bundle Wizard */}
      <BundleWizard
        open={!!selectedBundle}
        onClose={() => setSelectedBundle(null)}
        bundle={selectedBundle}
        branding={branding}
        hideCurrencySymbol={tenant?.hide_currency_symbol}
      />
    </div>
  )
}
