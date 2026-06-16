import {
  fetchCategories,
  fetchMenuItems,
  fetchOrderTypes,
  fetchPaymentMethods,
} from './supabase-queries'
import type { PosCatalogCache } from '../../../shared/types'

// Catalog caching for the offline-first POS register. The cache is the source
// of truth the register renders from; Supabase is only consulted to refresh it
// while online. Persistence lives in the main process via window.api so the
// snapshot survives restarts.

export async function getCachedCatalog(tenantId: string): Promise<PosCatalogCache | null> {
  return window.api.getPosCatalog(tenantId)
}

export async function refreshCatalog(tenantId: string): Promise<PosCatalogCache> {
  // Pull the three independent lists together; throws if Supabase is offline,
  // which lets the caller fall back to the previously cached snapshot.
  const [categories, menuItems, orderTypes] = await Promise.all([
    fetchCategories(tenantId),
    fetchMenuItems(tenantId),
    fetchOrderTypes(tenantId),
  ])

  // Payment methods vary per order type, so snapshot the unfiltered set ('')
  // plus one set per order type. Keyed lookups keep the register offline-safe.
  const paymentMethodKeys = ['', ...orderTypes.map((ot) => ot.id)]
  const paymentMethodLists = await Promise.all(
    paymentMethodKeys.map((key) =>
      fetchPaymentMethods(tenantId, key === '' ? undefined : key)
    )
  )
  const paymentMethods: Record<string, unknown[]> = {}
  paymentMethodKeys.forEach((key, i) => {
    paymentMethods[key] = paymentMethodLists[i] as unknown[]
  })

  const cache: PosCatalogCache = {
    tenantId,
    updatedAt: Date.now(),
    categories: categories as unknown[],
    menuItems: menuItems as unknown[],
    orderTypes: orderTypes as unknown[],
    paymentMethods,
  }

  await window.api.setPosCatalog(cache)
  return cache
}
