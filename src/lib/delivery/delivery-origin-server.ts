/**
 * Reads the branch a delivery starts from, for the server paths that price or
 * book it (quote, requote, distance fee, order creation).
 *
 * The branch is looked up by id on the server and must be one of the store's
 * own branches; the browser's coordinates are never used. Like
 * `resolveOrderOutlet`, a branch hidden since the menu loaded still counts: a
 * quote and the order it is checked against must agree on the origin.
 *
 * At checkout, branches only count while the store runs multi-branch (the same
 * switch `createOrderAction` obeys), so a stray `outletId` changes nothing for
 * a single-location store and costs it no query. An order that already belongs
 * to a branch (requote, booking) always starts there, whatever the switch says
 * now, so its rider is never sent to the main shop.
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
import { isUuid } from '@/lib/uuid'

/** The outlet columns an origin needs. */
export const ORIGIN_OUTLET_COLUMNS = 'id, address, latitude, longitude, delivery_radius_km'
/** The tenant columns an origin needs, for callers building their select. */
export const ORIGIN_TENANT_COLUMNS =
  'restaurant_address, restaurant_latitude, restaurant_longitude, delivery_radius_km, multi_branch_enabled'

export type OriginStore = OriginStoreFields & MultiBranchTenantFields & { id: string }

/** Shown when a browser sends a branch id that cannot be one (not a uuid). */
export const INVALID_BRANCH_MESSAGE = 'We could not find that branch. Please choose it again.'

/**
 * Whether a branch id sent by a browser or the app may be looked up: none at
 * all, or a uuid. Anything else is refused at the boundary rather than handed
 * to a uuid column filter (a hard PostgREST error, reported as "unreadable").
 */
export function isClientOutletIdValid(outletId: unknown): boolean {
  return outletId === null || outletId === undefined || outletId === '' || isUuid(outletId)
}

export type DeliveryOriginLookup = { ok: true; origin: DeliveryOrigin | null } | { ok: false }

async function readStoreOutlet(
  client: SupabaseClient,
  tenantId: string,
  outletId: string,
): Promise<{ ok: true; outlet: OriginOutletFields | null } | { ok: false }> {
  const { data, error } = await client
    .from('outlets')
    .select(ORIGIN_OUTLET_COLUMNS)
    .eq('id', outletId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[delivery-origin] could not read the branch', { tenantId, outletId, error: error.message })
    return { ok: false }
  }
  return { ok: true, outlet: (data as OriginOutletFields | null) ?? null }
}

export interface DeliveryOriginOptions {
  /** The id is the branch an existing order belongs to, not a checkout choice. */
  isOrderBranch?: boolean
}

export async function loadDeliveryOrigin(
  client: SupabaseClient,
  store: OriginStore,
  outletId: string | null | undefined,
  { isOrderBranch = false }: DeliveryOriginOptions = {},
): Promise<DeliveryOriginLookup> {
  const hasId = typeof outletId === 'string' && outletId.trim() !== ''
  const wantsBranch = hasId && (isOrderBranch || isMultiBranchEnabled(store))
  if (!wantsBranch) return { ok: true, origin: resolveDeliveryOrigin(store, null) }
  const read = await readStoreOutlet(client, store.id, outletId)
  if (!read.ok) return read
  return { ok: true, origin: resolveDeliveryOrigin(store, read.outlet) }
}
