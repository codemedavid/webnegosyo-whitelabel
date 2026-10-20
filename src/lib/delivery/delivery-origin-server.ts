/**
 * Reads the branch a delivery starts from, for the server paths that price or
 * book it (quote, requote, distance fee, order creation).
 *
 * The branch is looked up by id on the server and must be one of the store's
 * own ACTIVE branches; the browser's coordinates are never used. Branches only
 * count while the store runs multi-branch (the same switch the checkout and
 * `createOrderAction` obey), so a stray `outletId` changes nothing for a
 * single-location store and costs it no query.
 *
 * A read failure is reported, not papered over with the store pin: a quote
 * priced from the wrong origin would not match the order it is later checked
 * against.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveDeliveryOrigin,
  type DeliveryOrigin,
  type OriginOutletFields,
  type OriginStoreFields,
} from '@/lib/delivery/delivery-origin'
import { isMultiBranchEnabled, type MultiBranchTenantFields } from '@/lib/outlets/multi-branch-flag'

/** The outlet columns an origin needs. */
export const ORIGIN_OUTLET_COLUMNS = 'id, address, latitude, longitude, delivery_radius_km'
/** The tenant columns an origin needs, for callers building their select. */
export const ORIGIN_TENANT_COLUMNS =
  'restaurant_address, restaurant_latitude, restaurant_longitude, delivery_radius_km, multi_branch_enabled'

export type OriginStore = OriginStoreFields & MultiBranchTenantFields & { id: string }

export type DeliveryOriginLookup = { ok: true; origin: DeliveryOrigin | null } | { ok: false }

async function readActiveOutlet(
  client: SupabaseClient,
  tenantId: string,
  outletId: string,
): Promise<{ ok: true; outlet: OriginOutletFields | null } | { ok: false }> {
  const { data, error } = await client
    .from('outlets')
    .select(ORIGIN_OUTLET_COLUMNS)
    .eq('id', outletId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('[delivery-origin] could not read the branch', { tenantId, outletId, error: error.message })
    return { ok: false }
  }
  return { ok: true, outlet: (data as OriginOutletFields | null) ?? null }
}

export async function loadDeliveryOrigin(
  client: SupabaseClient,
  store: OriginStore,
  outletId: string | null | undefined,
): Promise<DeliveryOriginLookup> {
  const wantsBranch = typeof outletId === 'string' && outletId.trim() !== '' && isMultiBranchEnabled(store)
  if (!wantsBranch) return { ok: true, origin: resolveDeliveryOrigin(store, null) }
  const read = await readActiveOutlet(client, store.id, outletId)
  if (!read.ok) return read
  return { ok: true, origin: resolveDeliveryOrigin(store, read.outlet) }
}
