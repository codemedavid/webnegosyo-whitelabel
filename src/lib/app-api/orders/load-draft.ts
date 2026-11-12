import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppOrderDraft } from '@/lib/app-contract'
import { AppReadError } from '@/lib/app-api/store-reads'
import { ORDER_BACKEND_TENANT_COLUMNS, resolveOrderBackend, type OrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { OUTLET_MENU_OVERRIDE_SELECT } from '@/lib/outlets/outlet-menu-repository'
import { buildOutletMenuIndex, type OutletMenuOverrideRow } from '@/lib/outlets/outlet-menu-overrides'
import type { Category, MenuItem } from '@/lib/app-api/store-types'
import { linkedItemIdsForDraft, type DraftLinesInput } from './draft-to-lines'

/**
 * Everything `draftToOrderLines` needs for one app order (or voucher
 * preview), read fresh with the service role and scoped to the store:
 * the draft's dishes, their categories (default add-ons), the dishes their
 * linked options point at, and the chosen branch's overrides for all of them.
 *
 * Bounded: a draft holds at most 50 lines, so at most 50 dishes; linked dishes
 * are capped; every query filters by tenant and names its columns.
 */

/** Named columns only. What draftToOrderLines + item-modifier-groups read off a dish. */
export const DRAFT_ITEM_COLUMNS =
  'id, tenant_id, category_id, name, price, discounted_price, image_url, is_available, presell_enabled, modifier_groups, variation_types, variations, addons'
const DRAFT_CATEGORY_COLUMNS = 'id, tenant_id, name, is_active, default_addons'
/** The tenant columns the app order path reads: routing, branches, modifiers, Lalamove. */
const DRAFT_TENANT_COLUMNS = `id, is_active, ${ORDER_BACKEND_TENANT_COLUMNS}, modifier_groups_enabled, multi_branch_enabled, lalamove_enabled`

const MAX_DISHES = 50
/** More linked dishes than any real menu wires into one bag. */
const MAX_LINKED_DISHES = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const BRANCH_NOT_FOUND = 'That branch was not found. Choose your branch again.'
export const BRANCH_CLOSED = 'That branch is not taking orders right now. Choose another branch.'

export interface DraftTenant {
  id: string
  /** The raw row, as `modifierGroupsFor` reads it. */
  row: Record<string, unknown>
  backend: OrderBackend
  isLalamove: boolean
  isMultiBranch: boolean
  modifierGroupsEnabled: boolean
}

export interface DraftOutlet {
  id: string
  name: string
}

export type LoadedDraft =
  | { ok: true; input: DraftLinesInput; outlet: DraftOutlet | null }
  | { ok: false; error: string }

export interface DraftRequest {
  lines: AppOrderDraft['lines']
  outletId: string | null
}

const failed = (detail: string) => new AppReadError('the menu for this order', detail)

/** The store's row for the order path; null when it is gone or switched off. */
export async function readDraftTenant(db: SupabaseClient, tenantId: string): Promise<DraftTenant | null> {
  const { data, error } = await db.from('tenants').select(DRAFT_TENANT_COLUMNS).eq('id', tenantId).maybeSingle()
  if (error) throw failed(error.message)
  const row = data as Record<string, unknown> | null
  if (!row || row.is_active !== true) return null
  return {
    id: tenantId,
    row,
    backend: resolveOrderBackend(row as OrderBackendTenantFields),
    isLalamove: row.lalamove_enabled === true,
    isMultiBranch: isMultiBranchEnabled(row as { multi_branch_enabled?: boolean | null }),
    modifierGroupsEnabled: row.modifier_groups_enabled === true,
  }
}

async function readRows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw failed(error.message)
  return (data ?? []) as T[]
}

/** The branch the customer picked, when the store has branches; placeOrder re-validates it. */
async function readOutlet(db: SupabaseClient, tenant: DraftTenant, outletId: string | null) {
  if (!tenant.isMultiBranch || outletId === null) return { ok: true as const, outlet: null }
  if (!UUID.test(outletId)) return { ok: false as const, error: BRANCH_NOT_FOUND }
  const { data, error } = await db.from('outlets').select('id, name, is_active').eq('tenant_id', tenant.id).eq('id', outletId).maybeSingle()
  if (error) throw failed(error.message)
  const row = data as { id: string; name: string; is_active: boolean } | null
  if (!row) return { ok: false as const, error: BRANCH_NOT_FOUND }
  if (row.is_active !== true) return { ok: false as const, error: BRANCH_CLOSED }
  return { ok: true as const, outlet: { id: row.id, name: row.name } }
}

function readItems(db: SupabaseClient, tenantId: string, ids: readonly string[]): Promise<MenuItem[]> {
  if (ids.length === 0) return Promise.resolve([])
  return readRows<MenuItem>(db.from('menu_items').select(DRAFT_ITEM_COLUMNS).eq('tenant_id', tenantId).in('id', ids).limit(ids.length))
}

function readCategories(db: SupabaseClient, tenantId: string, dishes: readonly MenuItem[]): Promise<Category[]> {
  const ids = [...new Set(dishes.map((dish) => dish.category_id).filter((id) => typeof id === 'string' && UUID.test(id)))]
  if (ids.length === 0) return Promise.resolve([])
  return readRows<Category>(db.from('categories').select(DRAFT_CATEGORY_COLUMNS).eq('tenant_id', tenantId).in('id', ids).limit(ids.length))
}

function readOverrides(db: SupabaseClient, tenantId: string, outlet: DraftOutlet | null, itemIds: readonly string[]) {
  if (!outlet || itemIds.length === 0) return Promise.resolve([] as OutletMenuOverrideRow[])
  return readRows<OutletMenuOverrideRow>(
    db
      .from('outlet_menu_items')
      .select(OUTLET_MENU_OVERRIDE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('outlet_id', outlet.id)
      .in('menu_item_id', itemIds)
      .limit(itemIds.length),
  )
}

/**
 * The rows for one draft. A dish id that is not a uuid, or not this store's,
 * is simply not loaded — `draftToOrderLines` then refuses it as gone from the
 * menu. A branch the store does not have is refused here.
 */
export async function loadDraft(db: SupabaseClient, tenant: DraftTenant, request: DraftRequest): Promise<LoadedDraft> {
  const branch = await readOutlet(db, tenant, request.outletId)
  if (!branch.ok) return branch
  const dishIds = [...new Set(request.lines.map((line) => line.itemId))].filter((id) => UUID.test(id)).slice(0, MAX_DISHES)

  const dishes = await readItems(db, tenant.id, dishIds)
  const categories = await readCategories(db, tenant.id, dishes)
  const loaded = new Set(dishes.map((dish) => dish.id))
  const linkedIds = linkedItemIdsForDraft(dishes, categories, tenant.row)
    .filter((id) => !loaded.has(id) && UUID.test(id))
    .slice(0, MAX_LINKED_DISHES)
  const [linked, overrides] = await Promise.all([
    readItems(db, tenant.id, linkedIds),
    readOverrides(db, tenant.id, branch.outlet, [...loaded, ...linkedIds]),
  ])

  return {
    ok: true,
    outlet: branch.outlet,
    input: {
      lines: request.lines,
      menuItems: new Map([...dishes, ...linked].map((item) => [item.id, item])),
      categories,
      tenant: tenant.row,
      branchIndex: buildOutletMenuIndex(overrides),
      outletId: branch.outlet?.id ?? null,
    },
  }
}
