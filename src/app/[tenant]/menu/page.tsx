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
  const { addItem } = useCart()

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
    <div className="min-h-screen bg-background">
      {/* Minimal navbar substitute until we wire branding; using slug as name */}
      <div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <span className="text-xl font-bold">{tenantSlug}</span>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 space-y-6">
          <div>
            <h1 className="mb-2 text-3xl font-bold">Our Menu</h1>
            <p className="text-muted-foreground">
              Browse our delicious selection of items
            </p>
          </div>

          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search for dishes..."
          />

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

