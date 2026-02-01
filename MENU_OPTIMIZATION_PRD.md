# Menu Performance Optimization PRD
## SSR/ISR Implementation & Performance Improvements

**Project:** Menu SSR Optimization  
**Date:** 2025-01-29  
**Priority:** High  
**Status:** In Progress  

---

## Executive Summary

Transform the main menu page from Client-Side Rendering (CSR) to Incremental Static Regeneration (ISR) to achieve **85% faster page loads** and improve SEO. This PRD outlines 14 optimization tasks across 3 phases.

### Objectives
- Reduce First Contentful Paint (FCP) from 800-1500ms to < 200ms
- Improve Lighthouse Performance score from 50-60 to 85-95
- Reduce database queries from 3-5/request to 1-2/request
- Enable SEO indexing of menu pages
- Support 10x more concurrent users

### Success Metrics
| Metric | Current | Target | Success Threshold |
|--------|---------|--------|-------------------|
| First Contentful Paint (FCP) | 800-1500ms | < 200ms | ✅ < 200ms |
| Lighthouse Performance Score | 50-60 | 85-95 | ✅ > 85 |
| Database Queries/request | 3-5 | < 2 | ✅ < 2 |
| Initial Page Load (FCP) | 800-1500ms | 100-200ms | ✅ < 200ms |
| Menu Item Payload (list view) | 200KB | 30KB | ✅ < 40KB |
| Cache Hit Rate | 0% | > 60% | ✅ > 60% |

---

## Current Architecture Analysis

### Problems Identified

**1. Menu Page is Purely Client-Side Rendered**
- File: `/src/app/[tenant]/menu/page.tsx`
- Uses `'use client'` directive
- Fetches ALL data via `useEffect` on component mount
- Shows loading skeleton until data loads
- No initial HTML delivered to search engines (SEO disadvantage)

**2. Inefficient Data Fetching**
```typescript
// Current: Fetches ALL columns including huge JSONB fields
supabase.from('menu_items').select('*')
  .eq('tenant_id', tenant.id)
  .order('order')
// Result: ~2KB per item × 100 items = 200KB+ payload
```

**3. No Persistent Caching**
- Cache lost on every page refresh
- Database queried on every request
- No cross-request caching layer

**4. Client-Heavy Architecture**
- All filtering, sorting happens on client
- All data must be loaded before rendering
- No progressive enhancement

### Good Practices Already Implemented

✅ **Product Detail Page ISR** - Already uses ISR with 300s revalidation  
✅ **React cache()** - Per-request deduplication prevents duplicate queries  
✅ **Image Optimization** - OptimizedImage component with 30-day CDN cache  
✅ **Selective Query Columns** - Product detail page queries minimal columns  
✅ **Prefetching on Hover** - Client-side prefetching via PrefetchingCard component  

---

## Tasks Overview

### Phase 1: Quick Wins (Week 1) - Critical Impact
| ID | Task | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| P1-01 | Implement ISR for menu page | 🔴 Critical | 🟡 Medium | P0 | ⬜ Not Started |
| P1-02 | Reduce menu item columns for list view | 🔴 Critical | 🟢 Low | P0 | ⬜ Not Started |
| P1-03 | Add Upstash Redis caching layer | 🔴 Critical | 🟡 Medium | P0 | ⬜ Not Started |
| P1-04 | Optimize Cache-Control headers | 🟡 Medium | 🟢 Low | P1 | ⬜ Not Started |

### Phase 2: Architecture Improvements (Week 2) - High Impact
| ID | Task | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| P2-01 | Split menu page into Server + Client components | 🔴 Critical | 🟡 Medium | P0 | ⬜ Not Started |
| P2-02 | Implement on-demand item detail fetching | 🔴 Critical | 🟡 Medium | P0 | ⬜ Not Started |
| P2-03 | Add pagination for large menus | 🟡 Medium | 🟡 Medium | P2 | ⬜ Not Started |
| P2-04 | Add skeleton UI for menu grid | 🟢 Low | 🟢 Low | P2 | ⬜ Not Started |
| P2-05 | Integrate SWR/React Query for client data | 🟡 Medium | 🟡 Medium | P2 | ⬜ Not Started |

### Phase 3: Advanced Optimizations (Weeks 3-4) - Long-term Value
| ID | Task | Impact | Effort | Priority | Status |
|----|------|--------|--------|----------|--------|
| P3-01 | Implement webhook-based cache invalidation | 🟡 Medium | 🔴 High | P2 | ⬜ Not Started |
| P3-02 | Generate category pages ISR | 🟡 Medium | 🟡 Medium | P3 | ⬜ Not Started |
| P3-03 | Implement service worker (PWA) | 🟡 Medium | 🔴 High | P3 | ⬜ Not Started |
| P3-04 | Add database indexes | 🟢 Low | 🟢 Low | P4 | ⬜ Not Started |
| P3-05 | Implement virtual scrolling for large lists | 🟡 Medium | 🔴 High | P4 | ⬜ Not Started |

---

## Phase 1: Quick Wins

### P1-01: Implement ISR for Menu Page

**Description:** Convert the menu page from Client-Side Rendering to Server-Side Rendering with Incremental Static Regeneration (ISR). This will pre-render the menu on the server and cache it for 5 minutes.

**Current Implementation:**
```typescript
// src/app/[tenant]/menu/page.tsx
'use client'

export default function MenuPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [items, setItems] = useState<MenuItem[]>([])

  useEffect(() => {
    // Client-side data fetching
    const loadData = async () => {
      const supabase = createClient()
      const { data: tenant } = await supabase.from('tenants').select('*').eq('slug', tenantSlug)
      const { data: items } = await supabase.from('menu_items').select('*').eq('tenant_id', tenant.id)
      setTenant(tenant)
      setItems(items)
    }
    loadData()
  }, [])
}
```

**Target Implementation:**
```typescript
// src/app/[tenant]/menu/page.tsx
import { getCachedTenantBySlug, getCachedMenuItemsList, getCachedCategories } from '@/lib/menu-data'

export const dynamic = 'force-static'
export const revalidate = 300 // 5 minutes

export async function MenuPage({ params }: Props) {
  const { tenant: tenantSlug } = await params
  
  // Server-side data fetching
  const tenant = await getCachedTenantBySlug(tenantSlug)
  const [categories, menuItems] = await Promise.all([
    getCachedCategories(tenant.id),
    getCachedMenuItemsList(tenant.id)
  ])
  
  return <MenuContent tenant={tenant} categories={categories} menuItems={menuItems} />
}
```

**Files to Modify:**
- `/src/app/[tenant]/menu/page.tsx` - Main page file
- `/src/lib/menu-data.ts` - **NEW FILE** - Server-side data fetching functions

**Expected Result:**
- Initial page load from CDN cache: < 100ms
- FCP reduction: 85%
- SEO indexing enabled
- Database queries reduced by 60% (via cache)

**Verification:**
- [ ] Page loads without loading state
- [ ] Menu items visible on initial render
- [ ] `x-nextjs-cache: HIT` header present in dev tools
- [ ] Lighthouse FCP < 200ms
- [ ] View page source shows menu items in HTML

**Dependencies:** None (can start immediately)

---

### P1-02: Reduce Menu Item Columns for List View

**Description:** Create separate data fetching functions for list view vs detail view. List view should only fetch essential columns, excluding large JSONB fields (variations, variation_types, addons).

**Problem:**
```typescript
// Current: Fetches ALL columns including JSONB
supabase.from('menu_items').select('*') // ~2KB per item
// Result: 100 items × 2KB = 200KB payload
```

**Solution:**
```typescript
// List view: Essential columns only (~300B per item)
supabase.from('menu_items').select(`
  id, tenant_id, category_id, name, description,
  price, discounted_price, image_url, is_available,
  is_featured, order
`)
// Result: 100 items × 300B = 30KB payload (85% reduction)

// Detail view: Full data including JSONB
supabase.from('menu_items').select('*, variations, variation_types, addons')
```

**Files to Create/Modify:**
- `/src/lib/menu-data.ts` - **NEW FILE** - Create two functions:
  - `getCachedMenuItemsList(tenantId: string)` - Minimal columns
  - `getMenuItemDetail(itemId: string, tenantId: string)` - Full data with JSONB
- `/src/lib/product-detail-data.ts` - Existing - Update to use `getMenuItemDetail`

**Implementation Details:**
```typescript
// src/lib/menu-data.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCachedMenuItemsList = cache(async (tenantId: string) => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id, tenant_id, category_id, name, description,
      price, discounted_price, image_url, is_available,
      is_featured, order, created_at
    `)
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .order('order', { ascending: true })
  
  if (error) throw error
  return (data || []).map(item => ({
    ...item,
    variations: [], // Empty for list view
    variation_types: [], // Empty for list view
    addons: [] // Empty for list view
  }))
})

export async function getMenuItemDetail(itemId: string, tenantId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, variations, variation_types, addons')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  
  if (error) throw error
  return data
}
```

**Expected Result:**
- Initial page payload reduction: 85% (200KB → 30KB for 100 items)
- Faster data transmission
- Reduced memory usage
- Better performance on slow connections

**Verification:**
- [ ] Inspect Network tab: menu_items response < 40KB for 100 items
- [ ] Variations/addons not in list response
- [ ] Product detail page still loads full item data
- [ ] Lighthouse Transfer Size reduced

**Dependencies:** None (can start immediately)

---

### P1-03: Add Upstash Redis Caching Layer

**Description:** Implement Redis caching using Upstash for cross-request data persistence. This will cache database query results and serve them without hitting the database on subsequent requests.

**Architecture:**
```
Request → Check Redis Cache → 
  Hit: Return cached data (< 10ms)
  Miss: Query DB → Cache result (5-50ms) → Return
```

**Implementation:**
```typescript
// src/lib/redis-cache.ts - NEW FILE
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})

const CACHE_PREFIX = 'menu:'
const CACHE_TTL = {
  TENANT: 1800,      // 30 min - branding rarely changes
  CATEGORIES: 600,   // 10 min - categories rarely change
  MENU_ITEMS: 300,   // 5 min - prices/availability may change
  MENU_ITEM_DETAIL: 300, // 5 min
}

export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.MENU_ITEMS
): Promise<T> {
  const cacheKey = CACHE_PREFIX + key
  
  try {
    // Check Redis cache
    const cached = await redis.get<T>(cacheKey)
    if (cached !== null) {
      console.log(`[Redis Cache HIT] ${key}`)
      return cached
    }
  } catch (error) {
    console.warn('[Redis Cache GET error]:', error)
  }
  
  // Cache miss - fetch fresh data
  console.log(`[Redis Cache MISS] ${key}`)
  const data = await fetcher()
  
  try {
    // Store in Redis
    await redis.set(cacheKey, data, { ex: ttl })
  } catch (error) {
    console.warn('[Redis Cache SET error]:', error)
  }
  
  return data
}

export async function invalidateCache(pattern: string) {
  const keys = await redis.keys(`${CACHE_PREFIX}${pattern}`)
  if (keys.length > 0) {
    await redis.del(...keys)
    console.log(`[Redis Cache INVALIDATED] ${keys.length} keys matching ${pattern}`)
  }
}
```

**Usage in menu-data.ts:**
```typescript
export const getCachedMenuItemsList = cache(async (tenantId: string) => {
  return getCachedOrFetch(
    `items:${tenantId}`,
    async () => {
      const supabase = await createClient()
      const { data } = await supabase.from('menu_items').select('...').eq('tenant_id', tenantId)
      return data
    },
    CACHE_TTL.MENU_ITEMS // 5 minutes
  )
})
```

**Environment Variables Needed:**
```env
UPSTASH_REDIS_URL=your_redis_url
UPSTASH_REDIS_TOKEN=your_redis_token
```

**Files to Modify:**
- `/src/lib/redis-cache.ts` - **NEW FILE**
- `/src/lib/menu-data.ts` - New file from P1-02 - Integrate Redis caching
- `.env.example` - Add Upstash variables
- `package.json` - Add `@upstash/redis` dependency

**Installation:**
```bash
npm install @upstash/redis
```

**Expected Result:**
- Cache hit rate: > 60%
- Database queries: -60%
- Average response time: 10ms (cached) vs 50-100ms (DB)

**Verification:**
- [ ] First request: MISS, logs "Fetching fresh data"
- [ ] Second request: HIT, logs "Returning cached data"
- [ ] After 5 minutes: MISS again, logs "Cache expired"
- [ ] Inspect console for cache hit/miss logs

**Dependencies:** Requires Upstash account setup (free tier available)

**Setup Instructions:**
1. Create free Upstash account: https://upstash.com
2. Create Redis database
3. Copy REST URL and Token
4. Add to `.env.local`

---

### P1-04: Optimize Cache-Control Headers

**Description:** Set appropriate Cache-Control headers for static assets, images, and API responses to reduce redundant network requests.

**Implementation:**
```typescript
// next.config.ts - Enhance existing config
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // ... existing config ...

  headers: async () => {
    return [
      {
        source: '/:tenant/menu',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=600',
          },
          {
            key: 'CDN-Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=600',
          },
        ],
      },
      {
        source: '/:tenant/menu/item/:itemId',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=600',
          },
        ],
      },
      {
        source: '/(.*)\\.(jpg|jpeg|png|gif|webp|avif|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

export default nextConfig
```

**Cache-Control Header Values:**
- `public, s-maxage=300` - Cache at CDN for 5 minutes
- `stale-while-revalidate=600` - Serve stale content for up to 10 minutes while revalidating in background
- `max-age=31536000, immutable` - Cache static assets for 1 year (never change)

**Files to Modify:**
- `/next.config.ts` - Add headers configuration

**Expected Result:**
- Static assets served from browser cache
- Reduced bandwidth usage
- Faster repeat visits

**Verification:**
- [ ] Inspect Network tab: Status 200 for initial request, 304 for subsequent
- [ ] Images show "disk cache" or "memory cache"
- [ ] Cache-Control headers visible in response headers

**Dependencies:** None

---

## Phase 2: Architecture Improvements

### P2-01: Split Menu Page into Server + Client Components

**Description:** Separate the menu page into a Server Component (fetches data) and a Client Component (handles interactivity like search, filtering, cart actions). This enables SSR while maintaining interactive features.

**Implementation:**

**Server Component:**
```typescript
// src/app/[tenant]/menu/page.tsx
import { getCachedTenantBySlug, getCachedMenuItemsList, getCachedCategories } from '@/lib/menu-data'
import { MenuContent } from '@/components/customer/menu-content'

export const dynamic = 'force-static'
export const revalidate = 300

export async function generateMetadata({ params }: Props) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  return {
    title: tenant ? `${tenant.name} | Menu` : 'Menu',
    description: tenant?.description || 'Order online from our menu',
  }
}

export async function MenuPage({ params }: Props) {
  const { tenant: tenantSlug } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) {
    notFound()
  }

  const [categories, menuItems] = await Promise.all([
    getCachedCategories(tenant.id),
    getCachedMenuItemsList(tenant.id)
  ])
  
  return <MenuContent tenant={tenant} categories={categories} menuItems={menuItems} />
}
```

**Client Component:**
```typescript
// src/components/customer/menu-content.tsx - NEW FILE
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CategorySubmenu } from './category-submenu'
import { MenuGrid } from './menu-grid'
import { CartDrawer } from './cart-drawer'
import { ItemDetailModal } from './item-detail-modal'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem, Tenant, Category } from '@/types/database'

interface MenuContentProps {
  tenant: Tenant
  categories: Category[]
  menuItems: MenuItem[]
}

export function MenuContent({ tenant, categories, menuItems }: MenuContentProps) {
  const router = useRouter()
  const { addItem, items } = useCart()
  const branding = getTenantBranding(tenant)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)

  const filteredItems = useMemo(() => {
    let items = menuItems

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

    return items
  }, [menuItems, activeCategory, searchQuery])

  const handleItemSelect = (item: MenuItem) => {
    const hasCustomizations =
      item.variations.length > 0 ||
      item.addons.length > 0

    if (!hasCustomizations) {
      addItem(item, undefined, [], 1, undefined)
    } else {
      router.push(`/${tenant.slug}/menu/item/${item.id}`)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: branding.background }}>
      {/* Header, CategorySubmenu, MenuGrid with filteredItems */}
      {/* All existing UI components */}
    </div>
  )
}
```

**Files to Create/Modify:**
- `/src/app/[tenant]/menu/page.tsx` - Convert to Server Component
- `/src/components/customer/menu-content.tsx` - **NEW FILE** - Client Component with interactive logic
- Extract header, hero, and other static parts to Server Components if possible

**Expected Result:**
- Server-side rendered initial HTML
- Interactive features still work on client
- Better SEO
- Faster initial load

**Verification:**
- [ ] Page source HTML contains menu items
- [ ] Search/filtering works
- [ ] Cart functions work
- [ ] No errors in console

**Dependencies:** P1-01 (ISR implementation)

---

### P2-02: Implement On-Demand Item Detail Fetching

**Description:** Load full menu item data (variations, addons) only when user clicks on an item, not for the list view. This reduces initial payload and allows lazy loading of heavy data.

**Implementation:**

**Update PrefetchingCard component:**
```typescript
// src/components/customer/prefetching-card.tsx
import { useCallback } from 'react'
import { CardTemplateRenderer } from './card-templates'
import { getMenuItemDetail } from '@/lib/menu-data'
import type { MenuItem } from '@/types/database'

interface PrefetchingCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
}

export function PrefetchingCard({ item, onSelect, branding, template = 'classic' }: PrefetchingCardProps) {
  const handleMouseEnter = useCallback(async () => {
    // Only fetch if item has variations/addons (needs detail view)
    if (item.variations.length > 0 || item.addons.length > 0) {
      try {
        await getMenuItemDetail(item.id, item.tenant_id)
      } catch (err) {
        // Silent fail - prefetching is optional
      }
    }
  }, [item])

  return (
    <div onMouseEnter={handleMouseEnter}>
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={onSelect}
        branding={branding}
      />
    </div>
  )
}
```

**Update Product Detail Page:**
```typescript
// src/app/[tenant]/menu/item/[itemId]/page.tsx
import { getMenuItemDetail } from '@/lib/menu-data' // Use new function

export default async function ProductDetailPage({ params }: Props) {
  const { tenant: tenantSlug, itemId } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)
  const item = await getMenuItemDetail(itemId, tenant.id)
  
  return <ProductDetailContent tenant={tenant} item={item} />
}
```

**Files to Modify:**
- `/src/components/customer/prefetching-card.tsx` - Use `getMenuItemDetail` for prefetching
- `/src/app/[tenant]/menu/item/[itemId]/page.tsx` - Use `getMenuItemDetail`
- `/src/lib/menu-data.ts` - Ensure `getMenuItemDetail` function exists

**Expected Result:**
- Prefetching only happens for items with customizations
- Reduced network requests
- Smoother user experience

**Verification:**
- [ ] Network tab shows detail fetch on hover only for items with variations
- [ ] Product detail page loads correctly
- [ ] No 404 errors for missing variations

**Dependencies:** P1-02 (menu-data.ts with separate functions)

---

### P2-03: Add Pagination for Large Menus

**Description:** Implement server-side pagination for menus with > 50 items to improve performance and reduce initial payload.

**Implementation:**

**Server-side pagination function:**
```typescript
// src/lib/menu-data.ts
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export async function getMenuItemsPaginated(
  tenantId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<MenuItem>> {
  const cacheKey = `items:${tenantId}:${page}:${pageSize}`
  
  return getCachedOrFetch(
    cacheKey,
    async () => {
      const supabase = await createClient()
      
      // First get total count
      const { count } = await supabase
        .from('menu_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
      
      // Get paginated items
      const start = (page - 1) * pageSize
      const { data, error } = await supabase
        .from('menu_items')
        .select(`
          id, tenant_id, category_id, name, description,
          price, discounted_price, image_url, is_available,
          is_featured, order
        `)
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .order('order', { ascending: true })
        .range(start, start + pageSize - 1)
      
      if (error) throw error
      
      return {
        items: (data || []).map(item => ({
          ...item,
          variations: [],
          addons: []
        })) as MenuItem[],
        total: count || 0,
        page,
        pageSize,
        hasMore: (count || 0) > start + pageSize
      }
    },
    CACHE_TTL.MENU_ITEMS
  )
}
```

**Pagination component:**
```typescript
// src/components/customer/pagination.tsx - NEW FILE
interface PaginationProps {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize)
  
  if (totalPages <= 1) return null
  
  return (
    <div className="flex justify-center gap-2 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
      >
        Previous
      </button>
      <span className="px-4 py-2">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
      >
        Next
      </button>
    </div>
  )
}
```

**Files to Create/Modify:**
- `/src/lib/menu-data.ts` - Add `getMenuItemsPaginated` function
- `/src/components/customer/pagination.tsx` - **NEW FILE**
- `/src/components/customer/menu-content.tsx` - Integrate pagination
- `/src/app/[tenant]/menu/page.tsx` - Support page query param

**Expected Result:**
- Smaller initial payload for large menus
- Better performance with 100+ items
- Improved UX with progressive loading

**Verification:**
- [ ] Pagination buttons appear for > 20 items
- [ ] Clicking next page loads new items
- [ ] URL updates with `?page=2`
- [ ] Performance improves with 100+ items

**Dependencies:** P2-01 (Server + Client split)

---

### P2-04: Add Skeleton UI for Menu Grid

**Description:** Replace loading spinners with skeleton UI that shows the structure of menu items while data loads. This provides better perceived performance.

**Implementation:**

**Skeleton component:**
```typescript
// src/components/customer/menu-skeleton.tsx - NEW FILE
export function MenuSkeleton(count: number = 6) {
  return (
    <div className="grid gap-3 md:gap-6 lg:grid-cols-3 grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white overflow-hidden animate-pulse">
          <div className="aspect-square bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-10 bg-gray-200 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Usage in menu-content.tsx:**
```typescript
// Use skeleton for initial non-SSR pages or search results
// For ISR pages, skeletons may not be needed since data is pre-rendered
```

**Files to Create:**
- `/src/components/customer/menu-skeleton.tsx` - **NEW FILE**

**Expected Result:**
- Better perceived performance
- Smoother loading experience
- No jarring content shifts

**Verification:**
- [ ] Skeleton appears while loading
- [ ] Skeleton matches actual grid layout
- [ ] Smooth transition to actual content

**Dependencies:** None

---

### P2-05: Integrate SWR/React Query for Client Data

**Description:** Use SWR or React Query for client-side data management to enable automatic revalidation, optimistic updates, and better caching.

**Implementation (using SWR):**

```bash
npm install swr
```

**Create SWR fetcher:**
```typescript
// src/lib/swr-fetcher.ts - NEW FILE
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export function useSWR<T>(key: string | null) {
  return useSWRHook(key, (url: string) => fetcher<T>(url))
}
```

**Use in client components:**
```typescript
// src/components/customer/menu-content.tsx
import useSWR from 'swr'
import { fetcher } from '@/lib/swr-fetcher'

function MenuContent({ initialItems }: { initialItems: MenuItem[] }) {
  // Use SWR for real-time updates
  const { data: items, mutate } = useSWR<MenuItem[]>(
    `/api/menu-items?tenant=${tenantSlug}`,
    { 
      fallbackData: initialItems,
      revalidateOnFocus: false,
      revalidateOnReconnect: true
    }
  )

  // Optimistic update for cart
  const addToCart = async (item: MenuItem) => {
    // Optimistically update UI
    mutate((current) => {
      if (!current) return current
      return current.map(i => 
        i.id === item.id ? { ...i, inCart: true } : i
      )
    }, false)

    // Actual API call
    await addToCartAPI(item)
    
    // Revalidate to ensure consistency
    mutate()
  }
}
```

**Files to Create/Modify:**
- `/src/lib/swr-fetcher.ts` - **NEW FILE**
- `/src/components/customer/menu-content.tsx` - Integrate SWR
- `package.json` - Add `swr` dependency

**Expected Result:**
- Automatic revalidation
- Optimistic UI updates
- Better offline support
- Reduced redundant requests

**Verification:**
- [ ] Data revalidates after updates
- [ ] Optimistic updates show immediately
- [ ] Cache works correctly
- [ ] No stale data

**Dependencies:** None (but works better with P2-01)

---

## Phase 3: Advanced Optimizations

### P3-01: Implement Webhook-Based Cache Invalidation

**Description:** Create webhook endpoints that automatically invalidate caches when menu items are updated via the admin panel. This ensures users see fresh data immediately after admin updates.

**Implementation:**

**Webhook endpoint:**
```typescript
// src/app/api/webhooks/invalidate-menu/route.ts - NEW FILE
import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { tenantSlug, tenantId, type } = await request.json()
    
    if (!tenantSlug || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Revalidate specific paths
    if (type === 'menu_items') {
      revalidatePath(`/${tenantSlug}/menu`)
      revalidateTag(`tenant:${tenantId}`)
    }
    
    if (type === 'categories') {
      revalidatePath(`/${tenantSlug}/menu`)
      revalidateTag(`categories:${tenantId}`)
    }
    
    if (type === 'tenant') {
      revalidatePath(`/${tenantSlug}`)
      revalidateTag(`tenant:${tenantId}`)
    }
    
    return NextResponse.json({ success: true, revalidated: true })
  } catch (error) {
    return NextResponse.json({ error: 'Invalidation failed' }, { status: 500 })
  }
}
```

**Use cache tags:**
```typescript
// src/lib/menu-data.ts
export const getCachedMenuItemsList = cache(async (tenantId: string) => {
  // Set cache tags for this data
  unstable_cache(
    async () => {
      // ... fetch logic
    },
    [`menu-items:${tenantId}`],
    {
      tags: [`tenant:${tenantId}`],
      revalidate: 300
    }
  )()
})
```

**Call webhook from admin actions:**
```typescript
// src/app/actions/menu-items.ts
export async function updateMenuItemAction(...) {
  // ... update logic
  
  // Invalidate cache
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/invalidate-menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantSlug,
      tenantId,
      type: 'menu_items'
    })
  })
  
  return { success: true }
}
```

**Files to Create/Modify:**
- `/src/app/api/webhooks/invalidate-menu/route.ts` - **NEW FILE**
- `/src/app/actions/menu-items.ts` - Call webhook on updates
- `/src/lib/menu-data.ts` - Add cache tags

**Expected Result:**
- Fresh data immediately after admin updates
- No stale cache issues
- Better admin experience

**Verification:**
- [ ] Admin updates trigger webhook
- [ ] Cache invalidates
- [ ] Fresh data loads on next request

**Dependencies:** P1-01, P1-03 (Redis caching)

---

### P3-02: Generate Category Pages ISR

**Description:** Pre-generate static pages for each category to enable deep linking, SEO, and longer cache times (categories change less frequently than menu items).

**Implementation:**

**Category page:**
```typescript
// src/app/[tenant]/menu/category/[categoryId]/page.tsx - NEW FILE
import { getCachedTenantBySlug, getCachedCategoryById, getCachedMenuItemsList } from '@/lib/menu-data'

export const dynamic = 'force-static'
export const revalidate = 600 // 10 minutes (categories change less)

export async function generateStaticParams() {
  // Pre-generate for known tenants
  return []
  // Or generate on-demand with dynamicParams
}

export async function generateMetadata({ params }: Props) {
  const { tenant: tenantSlug, categoryId } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  const category = await getCachedCategoryById(categoryId, tenant?.id)
  
  return {
    title: category ? `${category.name} | ${tenant?.name}` : 'Category',
  }
}

export default async function CategoryPage({ params }: Props) {
  const { tenant: tenantSlug, categoryId } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)
  const category = await getCachedCategoryById(categoryId, tenant.id)
  const items = await getCachedMenuItemsList(tenant.id, categoryId)
  
  return (
    <div>
      <h1>{category?.name}</h1>
      <MenuGrid items={items} />
    </div>
  )
}
```

**Update menu-data.ts to filter by category:**
```typescript
export async function getCachedMenuItemsList(tenantId: string, categoryId?: string) {
  const supabase = await createClient()
  
  let query = supabase
    .from('menu_items')
    .select('...')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
  
  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }
  
  const { data } = await query.order('order')
  return data
}
```

**Files to Create/Modify:**
- `/src/app/[tenant]/menu/category/[categoryId]/page.tsx` - **NEW FILE**
- `/src/lib/menu-data.ts` - Support category filtering

**Expected Result:**
- SEO-indexable category pages
- Longer cache times (10 min)
- Better deep linking

**Verification:**
- [ ] Category pages load
- [ ] SEO meta tags present
- [ ] Items filtered by category
- [ ] Performance is good

**Dependencies:** P1-01, P1-02

---

### P3-03: Implement Service Worker (PWA)

**Description:** Add a service worker to enable offline capability, background sync, and improved caching for a Progressive Web App experience.

**Implementation:**

```bash
npm install next-pwa
```

**Update next.config.ts:**
```typescript
import withPWA from 'next-pwa'

const nextConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})({
  // ... existing config
})

export default nextConfig
```

**PWA manifest:**
```json
// public/manifest.json
{
  "name": "Restaurant Menu",
  "short_name": "Menu",
  "description": "Order online",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Files to Create/Modify:**
- `/next.config.ts` - Add PWA config
- `/public/manifest.json` - **NEW FILE**
- `/src/app/layout.tsx` - Add manifest link
- `package.json` - Add `next-pwa` dependency

**Expected Result:**
- Offline access to viewed menus
- Add to home screen capability
- Push notifications potential
- Better mobile experience

**Verification:**
- [ ] PWA install prompt appears
- [ ] App works offline (cached pages)
- [ ] Service worker registered
- [ ] Lighthouse PWA score > 90

**Dependencies:** None

---

### P3-04: Add Database Indexes

**Description:** Create database indexes to optimize query performance for frequently accessed data.

**Implementation:**

```sql
-- Run these in Supabase SQL Editor

-- Index for tenant by slug (most common query)
CREATE INDEX IF NOT EXISTS idx_tenants_slug 
ON tenants(slug) 
WHERE is_active = true;

-- Composite index for menu items (tenant + order + availability)
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_order 
ON menu_items(tenant_id, "order", is_available) 
WHERE is_available = true;

-- Index for category lookup
CREATE INDEX IF NOT EXISTS idx_menu_items_category 
ON menu_items(category_id, tenant_id) 
WHERE is_available = true;

-- Index for categories
CREATE INDEX IF NOT EXISTS idx_categories_tenant 
ON categories(tenant_id, "order") 
WHERE is_active = true;

-- Index for product detail settings
CREATE INDEX IF NOT EXISTS idx_product_detail_settings_tenant 
ON product_detail_settings(tenant_id);
```

**Verification:**
- [ ] Indexes created successfully
- [ ] Query plan shows index usage (EXPLAIN ANALYZE)
- [ ] Query performance improved

**Dependencies:** None (but helpful with P2-03 pagination)

---

### P3-05: Implement Virtual Scrolling for Large Lists

**Description:** Add virtual scrolling for menus with 100+ items to render only visible items, improving performance and memory usage.

**Implementation:**

```bash
npm install @tanstack/react-virtual
```

**Virtualized menu grid:**
```typescript
// src/components/customer/virtual-menu-grid.tsx - NEW FILE
'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MenuItem } from '@/types/database'

interface VirtualMenuGridProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
}

export function VirtualMenuGrid({ items, onItemSelect, branding }: VirtualMenuGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300, // Estimated item height
    overscan: 5, // Render 5 extra items
  })
  
  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MenuItemCard
                item={item}
                onSelect={onItemSelect}
                branding={branding}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Usage:**
```typescript
// Conditionally use virtual scrolling for large lists
const itemsCount = menuItems.length

{itemsCount > 50 ? (
  <VirtualMenuGrid items={items} onItemSelect={handleItemSelect} branding={branding} />
) : (
  <MenuGrid items={items} onItemSelect={handleItemSelect} branding={branding} />
)}
```

**Files to Create:**
- `/src/components/customer/virtual-menu-grid.tsx` - **NEW FILE**
- `/src/components/customer/menu-content.tsx` - Conditionally use virtual scrolling
- `package.json` - Add `@tanstack/react-virtual` dependency

**Expected Result:**
- Constant performance regardless of item count
- Reduced memory usage
- Smoother scrolling for 100+ items

**Verification:**
- [ ] Virtual scrolling works
- [ ] Only visible items rendered (inspect DOM)
- [ ] Performance is constant with 1000+ items
- [ ] No layout shifts

**Dependencies:** P1-02 (lightweight items)

---

## Estimated Timeline

### Week 1: Quick Wins (Phase 1)
- **Day 1-2:** P1-01 (ISR for menu page) + P1-02 (Reduce columns)
- **Day 3:** P1-04 (Cache-Control headers)
- **Day 4-5:** P1-03 (Upstash Redis)

### Week 2: Architecture Improvements (Phase 2)
- **Day 1-2:** P2-01 (Server + Client split)
- **Day 3:** P2-02 (On-demand fetching)
- **Day 4:** P2-03 (Pagination)
- **Day 5:** P2-04 (Skeleton UI) + P2-05 (SWR - optional)

### Week 3-4: Advanced Optimizations (Phase 3)
- **Week 3 Day 1-2:** P3-01 (Webhook invalidation)
- **Week 3 Day 3-4:** P3-02 (Category pages)
- **Week 4 Day 1:** P3-04 (Database indexes)
- **Week 4 Day 2-4:** P3-03 (PWA) or P3-05 (Virtual scrolling)

---

## Monitoring Setup

### 1. Next.js Analytics
```bash
npm install @vercel/analytics
```

Add to `src/app/layout.tsx`:
```typescript
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### 2. Performance Tracking
Create `/src/lib/metrics.ts`:
```typescript
export const metrics = {
  cacheHit: (data: { key: string; duration: number }) => {
    console.log(`[CACHE HIT] ${data.key} (${data.duration}ms)`)
  },
  cacheMiss: (data: { key: string; duration: number }) => {
    console.log(`[CACHE MISS] ${data.key} (${data.duration}ms)`)
  },
  pageLoad: (data: { page: string; duration: number }) => {
    console.log(`[PAGE LOAD] ${data.page} (${data.duration}ms)`)
  }
}
```

### 3. Lighthouse CI
Create `lighthouserc.json`:
```json
{
  "ci": {
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

---

## Risk Assessment

### High Risk
- ** breaking changes to existing navigation/search** - Mitigation: Test thoroughly
- **Cache invalidation issues** - Mitigation: Implement short TTL initially, monitor, increase
- **Race conditions in Redis** - Mitigation: Use atomic operations, implement retry logic

### Medium Risk
- **Complex state management with Server + Client split** - Mitigation: Keep Server Component simple, move complexity to Client Component
- **PWA installation issues** - Mitigation: Test on multiple devices, provide fallback

### Low Risk
- **Database index creation** - Mitigation: Non-blocking operations, can be rolled back
- **Skeleton UI misalignment** - Mitigation: Simple implementation, easy to fix

---

## Rollback Plan

If issues arise after deployment:

### Immediately
1. Disable ISR by changing `revalidate = 0` or `dynamic = 'force-dynamic'`
2. Revert menu page to Client Component
3. Disable Redis caching by adding environment flag

### After Investigation
1. Identify root cause
2. Fix specific issue
3. Re-rollout incrementally

**Fast rollback command:**
```bash
git revert <commit-hash>
npm run build
```

---

## Success Criteria

### Must Have
- [ ] FCP < 200ms (from 800-1500ms)
- [ ] Lighthouse Performance > 85
- [ ] Database queries < 2/request
- [ ] Menu pages are SEO-indexable
- [ ] No regressions in functionality

### Should Have
- [ ] PWA installable
- [ ] Offline working (cached pages)
- [ ] Category pages indexed
- [ ] Webhook invalidation working

### Nice to Have
- [ ] Virtual scrolling for 100+ items
- [ ] Service worker caching
- [ ] Real-time updates

---

## Open Questions

1. **Upstash Redis** - Do we have free tier credentials or need to create account?
2. **Webhook security** - Should we add authentication for webhook endpoints?
3. **Category page URLs** - Should category pages be `/menu/category/[id]` or `/menu#category-[id]`?
4. **Pagination threshold** - At what item count should pagination trigger? (Proposed: 50 items)
5. **Virtual scrolling threshold** - At what item count should virtual scrolling enable? (Proposed: 100 items)

---

## Glossary

- **CSR (Client-Side Rendering)**: All HTML generated in browser after JavaScript loads
- **SSR (Server-Side Rendering)**: HTML generated on server, sent to browser
- **ISR (Incremental Static Regeneration)**: Static pages regenerated on a schedule (e.g., every 5 minutes)
- **FCP (First Contentful Paint)**: Browser renders first content, perceived load time
- **Lighthouse**: Performance audit tool from Chrome
- **Redis**: In-memory data store for caching
- **Upstash**: Redis-compatible edge database
- **SWR**: Data fetching library for React
- **PWA (Progressive Web App)**: Web app with app-like features
- **JSONB**: Binary JSON format in PostgreSQL

---

## Appendices

### A. Environment Variables Template

```env
# Upstash Redis
UPSTASH_REDIS_URL=your_rest_url
UPSTASH_REDIS_TOKEN=your_token

# App URL (for webhooks)
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Feature Flags (for gradual rollout)
ENABLE_ISR=true
ENABLE_REDIS_CACHE=true
ENABLE_PWA=false
```

### B. Testing Checklist

- [ ] Test on mobile (iOS Safari, Chrome)
- [ ] Test on desktop (Chrome, Firefox, Safari)
- [ ] Test slow network (Chrome DevTools -> Network -> Slow 3G)
- [ ] Test offline mode (turn off WiFi)
- [ ] Test cache invalidation (update menu items in admin)
- [ ] Test SEO (view page source, check HTML)
- [ ] Test Lighthouse score
- [ ] Test with large menus (100+ items)
- [ ] Test with small menus (10 items)
- [ ] Test category filtering
- [ ] Test search functionality

### C. Performance Benchmarking

Run before and after optimization:

```bash
# Install lighthouse
npm install -g lighthouse

# Test menu page
lighthouse https://yourdomain.com/bella-italia/menu --view

# Test product detail page
lighthouse https://yourdomain.com/bella-italia/menu/item/123 --view
```

Expected improvements:
- Menu page FCP: 1200ms → 150ms
- Menu page Lighthouse: 55 → 90
- Product detail: Should improve slightly (already optimized)

### D. Related Documentation

- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [ISR Guide](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- [SWR Documentation](https://swr.vercel.app)

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-01-29 | 1.0 | Initial PRD | AI Assistant |

---

**Last Updated:** 2025-01-29  
**Next Review:** After Phase 1 completion  
**Status:** 🟡 In Development
