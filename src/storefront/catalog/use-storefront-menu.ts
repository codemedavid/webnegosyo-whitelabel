'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useCart } from '@/hooks/useCart'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'
import { resolveOutletAvailability } from '@/lib/outlets/outlet-availability'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import { useBranchMenu } from '@/hooks/use-branch-menu'
import { bundleToMenuItem, isBundleMenuItem } from '@/lib/bundle-adapter'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import type { Category, MenuItem, BundleWithSlots } from '@/types/database'
import type { StorefrontMenuInput, StorefrontMenuController } from '../contracts'

/** Shopping behavior shared by current and future storefront compositions. */
export function useStorefrontMenu({ tenant, categories, allMenuItems: storeWideMenuItems, bundles, outlets, outletsFailed, menuOverrides, overridesFailed, tenantSlug, isBrandAdmin }: StorefrontMenuInput): StorefrontMenuController {
  const tenantId = tenant?.id
  const router = useRouter()
  const { addItem, item_count, setTenantContext } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<BundleWithSlots | null>(null)
  // The item shown in the product-detail bottom sheet (null = closed).
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  useEffect(() => {
    if (tenantId && tenantSlug) setTenantContext(tenantId, tenantSlug)
  }, [tenantId, tenantSlug, setTenantContext])

  // The branch the customer is shopping. Read here as well as inside the gate
  // because the gate decides whether to ASK; this decides what to SHOW, and the
  // two have to agree on the answer.
  const branchSelection = useOutletSelection({
    isEnabled: isMultiBranchEnabled(tenant),
    tenantSlug,
    outlets,
  })

  // The menu as this branch sells it. With no branch chosen — a single-location
  // tenant, or one that asks at checkout — this is the store-wide menu itself.
  const { items: allMenuItems } = useBranchMenu({
    items: storeWideMenuItems,
    overrides: menuOverrides,
    selectedOutletId: branchSelection.outlet?.id ?? null,
  })

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

    const bundleMenuItems = bundles.map((b) => bundleToMenuItem(b, allMenuItems))

    return {
      categoriesWithBundles: [bundleCategory, ...categories],
      allItemsWithBundles: [...bundleMenuItems, ...allMenuItems],
    }
  }, [bundles, categories, allMenuItems, tenant?.id])

  const sortedItems = useMemo(() => [...allItemsWithBundles].sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1
    if (!a.is_featured && b.is_featured) return 1
    if (tenant?.menu_engineering_enabled) {
      if (a.bcg_classification === 'star' && b.bcg_classification !== 'star') return -1
      if (a.bcg_classification !== 'star' && b.bcg_classification === 'star') return 1
    }
    return a.order - b.order
  }), [allItemsWithBundles, tenant?.menu_engineering_enabled])

  const searchItems = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    if (!query) return sortedItems
    return sortedItems.filter(item =>
      item.name.toLowerCase().includes(query) || (item.description ?? '').toLowerCase().includes(query)
    )
  }, [sortedItems, debouncedSearchQuery])

  const filteredItems = useMemo(() => activeCategory
    ? searchItems.filter(item => item.category_id === activeCategory)
    : searchItems, [searchItems, activeCategory])

  // Operating-hours enforcement. Resolves after mount (the page is ISR-cached, so
  // the server's answer would be stale) and re-checks every minute.
  const openStatus = useStoreOpenStatus(tenant)

  // A multi-branch storefront that could not load its branches must not quietly
  // serve the single-location flow — that is how an order reaches the wrong
  // kitchen (Phase 1, Decision E). The menu still renders; ordering is what stops.
  const outletAvailability = resolveOutletAvailability({
    isEnabled: isMultiBranchEnabled(tenant),
    // An override failure is the same class of problem as a branch failure: the
    // menu on screen may not be the menu this branch sells, so it must not be
    // ordered from.
    didLoadFail: Boolean(outletsFailed) || Boolean(overridesFailed),
    outletCount: outlets.length,
  })

  // Stable callback: prevents entire card grid from re-rendering on unrelated state changes
  const handleItemSelect = useCallback((item: MenuItem) => {
    if (!outletAvailability.canOrder) {
      toast.error(outletAvailability.message ?? '')
      return
    }
    if (openStatus.isOrderingBlocked) {
      toast.error(
        openStatus.nextOpenLabel
          ? `${STORE_CLOSED_MESSAGE}. Opens ${openStatus.nextOpenLabel}.`
          : `${STORE_CLOSED_MESSAGE}.`
      )
      return
    }
    if (isBundleMenuItem(item)) {
      setSelectedBundle(item._bundleData)
      return
    }
    if (!isMenuItemOrderable(item)) {
      toast.error('This item is currently unavailable')
      return
    }
    const hasCustomizations =
      (item.modifier_groups?.length ?? 0) > 0 ||
      !!item.presell_enabled ||
      (item.variations?.length ?? 0) > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      (item.addons?.length ?? 0) > 0
    // Only skip the sheet for a bare item when NO upsell surface applies — the
    // sheet is also where pairing-rule and bundle upsells render, so those flags
    // must keep an otherwise-customization-free item routed through it.
    const hasUpsellSurface =
      tenant?.menu_engineering_enabled ||
      tenant?.pairing_rules_enabled ||
      tenant?.bundles_enabled
    if (!hasCustomizations && !hasUpsellSurface) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else if (isBrandAdmin) {
      // Brand admins keep navigating to the full page so the inline branding
      // editor and product-detail customizer remain available.
      router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
    } else {
      // Customers get the instant bottom sheet instead of a route navigation.
      setSheetItem(item)
    }
  }, [tenant?.menu_engineering_enabled, tenant?.pairing_rules_enabled, tenant?.bundles_enabled, addItem, router, tenantSlug, isBrandAdmin, openStatus.isOrderingBlocked, openStatus.nextOpenLabel, outletAvailability.canOrder, outletAvailability.message])

  return {
    tenant, tenantSlug, categories, allMenuItems, categoriesWithBundles, filteredItems, searchItems,
    searchQuery, setSearchQuery, activeCategory, setActiveCategory, itemCount: item_count, openStatus,
    isCartOpen, openCart: () => setIsCartOpen(true), closeCart: () => setIsCartOpen(false),
    selectedBundle, closeBundle: () => setSelectedBundle(null),
    sheetItem, closeProduct: () => setSheetItem(null), selectItem: handleItemSelect,
  }
}
