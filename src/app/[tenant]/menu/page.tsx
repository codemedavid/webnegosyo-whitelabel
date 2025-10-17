'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
// import { Navbar } from '@/components/shared/navbar'
import { CategoryTabs } from '@/components/customer/category-tabs'
import { SearchBar } from '@/components/customer/search-bar'
import { MenuGrid } from '@/components/customer/menu-grid'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { useCart } from '@/hooks/useCart'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'
import { createClient } from '@/lib/supabase/client'
import type { Category, MenuItem } from '@/types/database'

export default function MenuPage() {
  const params = useParams()
  const tenantSlug = params.tenant as string
  const { addItem, items } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // Get tenant and data
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([])

  // Load tenant + categories + menu_items from Supabase
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: tenant } = await getTenantBySlugSupabase(tenantSlug)
      if (!tenant) return
      setTenantId(tenant.id)
      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('order'),
        supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).order('order'),
      ])
      setCategories((cats as Category[]) || [])
      setAllMenuItems((items as MenuItem[]) || [])
    })()
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

  if (!tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Restaurant not found</h1>
          <p className="text-muted-foreground">
            The restaurant you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20">
      {/* Header with ClickEats-style design */}
      <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
        <div className="container mx-auto px-4">
          <div className="flex h-20 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500">
                <span className="text-lg font-bold text-white">{tenantSlug.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{tenantSlug.replace(/-/g, ' ')}</h1>
                <p className="text-xs text-gray-500">Smart Ordering Partner</p>
              </div>
            </div>

            {/* Category Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <button
                className={`text-sm font-medium transition-colors ${
                  !activeCategory ? 'text-orange-600' : 'text-gray-600 hover:text-orange-600'
                }`}
                onClick={() => setActiveCategory(null)}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    activeCategory === category.id ? 'text-orange-600' : 'text-gray-600 hover:text-orange-600'
                  }`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <span className="text-lg">{category.icon || '🍽️'}</span>
                  {category.name}
                </button>
              ))}
            </nav>

            {/* Utility Icons */}
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-orange-600 transition-colors">
                <span className="text-lg">📦</span>
                <span className="hidden sm:inline">Track Order</span>
              </button>
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-gray-600 hover:text-orange-600 transition-colors"
              >
                <span className="text-xl">🛒</span>
                {items.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                    {items.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-serif font-bold text-gray-900 mb-4">
            Our Menu
          </h1>
          <p className="text-lg text-gray-600 font-light">
            Your Smart Ordering Partner
          </p>
        </div>

        {/* Mobile Search */}
        <div className="mb-8 md:hidden">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search for dishes..."
          />
        </div>

        {/* Mobile Category Navigation */}
        <div className="mb-8 md:hidden">
          <CategoryTabs
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </div>

        <MenuGrid items={filteredItems} onItemSelect={setSelectedItem} />
      </main>

      <ItemDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={addItem}
      />

      <CartDrawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        tenantSlug={tenantSlug}
      />
    </div>
  )
}

