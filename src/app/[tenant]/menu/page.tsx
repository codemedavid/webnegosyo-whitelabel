'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
// import { Navbar } from '@/components/shared/navbar'
import { CategoryTabs } from '@/components/customer/category-tabs'
import { CategorySubmenu } from '@/components/customer/category-submenu'
import { SearchBar } from '@/components/customer/search-bar'
import { MenuGrid } from '@/components/customer/menu-grid'
import { MenuGridGrouped } from '@/components/customer/menu-grid-grouped'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { useCart } from '@/hooks/useCart'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'
import { createClient } from '@/lib/supabase/client'
import { getTenantByIdSupabase } from '@/lib/tenants-service'
import { getTenantBranding } from '@/lib/branding-utils'
import { BrandingEditorOverlay } from '@/components/admin/branding-editor-overlay'
import { toast } from 'sonner'
import type { Category, MenuItem, Tenant } from '@/types/database'
import type { CardTemplate } from '@/lib/card-templates'

export default function MenuPage() {
  const params = useParams()
  const tenantSlug = params.tenant as string
  const { addItem, items } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // Get tenant and data
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load tenant + categories + menu_items from Supabase
  useEffect(() => {
    let isCancelled = false
    
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const supabase = createClient()
        const { data: tenantData, error: tenantError } = await getTenantBySlugSupabase(tenantSlug)
        
        if (isCancelled) return
        
        if (tenantError || !tenantData) {
          setError('Restaurant not found')
          setIsLoading(false)
          return
        }
        
        // Save tenant data for branding
        setTenant(tenantData)
        
        const [{ data: cats, error: catsError }, { data: items, error: itemsError }] = await Promise.all([
          supabase.from('categories').select('*').eq('tenant_id', tenantData.id).order('order'),
          supabase.from('menu_items').select('*').eq('tenant_id', tenantData.id).order('order'),
        ])
        
        if (isCancelled) return
        
        if (catsError || itemsError) {
          setError('Failed to load menu data')
          setIsLoading(false)
          return
        }
        
        setCategories((cats as Category[]) || [])
        setAllMenuItems((items as MenuItem[]) || [])
      } catch {
        if (!isCancelled) {
          setError('An unexpected error occurred')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }
    
    loadData()
    
    return () => {
      isCancelled = true
    }
  }, [tenantSlug])

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    let items = allMenuItems

    // Filter by category
    if (activeCategory) {
      items = items.filter((item) => item.category_id === activeCategory)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
      )
    }

    // Sort by order and featured
    return items.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1
      if (!a.is_featured && b.is_featured) return 1
      return a.order - b.order
    })
  }, [allMenuItems, activeCategory, searchQuery])

  // Get branding colors with fallbacks
  const baseBranding = getTenantBranding(tenant)
  const [brandingOverride, setBrandingOverride] = useState<Partial<Record<string, string>> | null>(null)
  const [heroOverride, setHeroOverride] = useState<{ title?: string; description?: string; heroTitleColor?: string; heroDescriptionColor?: string } | null>(null)
  const [cardTemplateOverride, setCardTemplateOverride] = useState<string | null>(null)
  const branding = useMemo(() => {
    if (!brandingOverride) return baseBranding
    return { ...baseBranding, ...brandingOverride }
  }, [baseBranding, brandingOverride])

  function mapDraftToBranding(draft: Partial<Record<string, string>> | null): Partial<Record<string, string>> | null {
    if (!draft) return null
    const mapped: Record<string, string> = {}
    const setIf = (key: string, value?: string) => { if (value) mapped[key] = value }
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

  function mapDraftToHero(draft: Partial<Record<string, string>> | null) {
    if (!draft) return null
    return {
      title: draft.hero_title,
      description: draft.hero_description,
      heroTitleColor: draft.hero_title_color,
      heroDescriptionColor: draft.hero_description_color,
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div 
        className="min-h-screen"
        style={{ backgroundColor: branding.background }}
      >
        {/* Header skeleton */}
        <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
          <div className="container mx-auto px-4">
            <div className="flex h-20 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse"></div>
                <div>
                  <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-1"></div>
                  <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-8">
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12">
          {/* Hero section skeleton */}
          <div className="text-center mb-16">
            <div className="h-16 w-64 bg-gray-200 rounded mx-auto mb-4 animate-pulse"></div>
            <div className="h-6 w-48 bg-gray-200 rounded mx-auto animate-pulse"></div>
          </div>

          {/* Menu grid skeleton */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="aspect-[4/3] bg-gray-200 animate-pulse"></div>
                <div className="p-4 space-y-3">
                  <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-1/2"></div>
                  <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  // Show error state
  if (error) {
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
            {error === 'Restaurant not found' 
              ? "The restaurant you're looking for doesn't exist or may have been removed."
              : "We're having trouble loading the menu. Please try again later."
            }
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
      {/* Header with dynamic branding */}
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
            {/* Logo */}
            <div className="flex items-center gap-3">
              {tenant?.logo_url ? (
                <div className="relative h-12 w-12 rounded-full overflow-hidden">
                  <Image 
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


            {/* Utility Icons */}
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

      {/* Desktop Category Submenu */}
      {!isLoading && categories.length > 0 && (
        <CategorySubmenu
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          branding={branding}
        />
      )}

      {/* Admin overlay for live edit (only renders if allowed) */}
      {tenant && (
        <BrandingEditorOverlay
          tenant={tenant}
          onPreview={(draft) => {
            setBrandingOverride(mapDraftToBranding(draft))
            setHeroOverride(mapDraftToHero(draft))
            setCardTemplateOverride(draft?.card_template || null)
          }}
          onSaved={async () => {
            if (!tenant?.id) return
            const { data } = await getTenantByIdSupabase(tenant.id)
            if (data) {
              setTenant(data)
              setBrandingOverride(null)
              setHeroOverride(null)
              setCardTemplateOverride(null)
              toast.success('Branding updated!')
            }
          }}
        />
      )}

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 
            className="text-5xl font-serif font-bold mb-4"
            style={{ color: heroOverride?.heroTitleColor || tenant?.hero_title_color || branding.textPrimary }}
          >
            {heroOverride?.title || tenant?.hero_title || 'Our Menu'}
          </h1>
          <p 
            className="text-lg font-light"
            style={{ color: heroOverride?.heroDescriptionColor || tenant?.hero_description_color || branding.textSecondary }}
          >
            {heroOverride?.description || tenant?.hero_description || 'Your Smart Ordering Partner'}
          </p>
        </div>

        {/* Mobile Search */}
        {!isLoading && (
          <div className="mb-8 md:hidden">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search for dishes..."
            />
          </div>
        )}

        {/* Mobile Category Navigation - Sticky */}
        {!isLoading && categories.length > 0 && (
          <div 
            className="sticky top-20 z-40 backdrop-blur-sm border-b mb-8 md:hidden" 
            style={{ 
              backgroundColor: branding.header,
              borderColor: branding.border 
            }}
          >
            <div className="px-4 py-3">
              <CategoryTabs
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                branding={branding}
              />
            </div>
          </div>
        )}

        {filteredItems.length === 0 && !isLoading ? (
          <div className="text-center py-16">
            <div 
              className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: branding.cards }}
            >
              <span className="text-3xl">🍽️</span>
            </div>
            <h3 
              className="text-xl font-semibold mb-2"
              style={{ color: branding.textPrimary }}
            >
              No items found
            </h3>
            <p 
              className="mb-6"
              style={{ color: branding.textSecondary }}
            >
              {searchQuery || activeCategory 
                ? "Try adjusting your search or category filter"
                : "This restaurant doesn't have any menu items yet"
              }
            </p>
            {(searchQuery || activeCategory) && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setActiveCategory(null)
                }}
                className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
                style={{ 
                  backgroundColor: branding.buttonPrimary,
                  color: branding.buttonPrimaryText 
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Show grouped view when no category is selected, regular grid when category is selected
          activeCategory ? (
            <MenuGrid 
              items={filteredItems}
              template={(cardTemplateOverride || tenant?.card_template || 'classic') as CardTemplate}
              onItemSelect={(item) => {
                // If item has no variations or add-ons, add directly to cart
                const hasCustomizations = item.variations.length > 0 || item.addons.length > 0
                if (!hasCustomizations) {
                  addItem(
                    item,
                    undefined, // no variation
                    [], // no addons
                    1, // default quantity
                    undefined // no special instructions
                  )
                  toast.success(`Added ${item.name} to cart`)
                } else {
                  // Open modal for items with customizations
                  setSelectedItem(item)
                }
              }}
              branding={branding}
            />
          ) : (
            <MenuGridGrouped 
              items={filteredItems} 
              categories={categories}
              template={(cardTemplateOverride || tenant?.card_template || 'classic') as CardTemplate}
              onItemSelect={(item) => {
                // If item has no variations or add-ons, add directly to cart
                const hasCustomizations = item.variations.length > 0 || item.addons.length > 0
                if (!hasCustomizations) {
                  addItem(
                    item,
                    undefined, // no variation
                    [], // no addons
                    1, // default quantity
                    undefined // no special instructions
                  )
                  toast.success(`Added ${item.name} to cart`)
                } else {
                  // Open modal for items with customizations
                  setSelectedItem(item)
                }
              }}
              branding={branding}
            />
          )
        )}
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

