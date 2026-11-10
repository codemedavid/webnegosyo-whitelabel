/**
 * The server's own read of what an order holds, for `order-stock-lines.ts` to
 * judge a register's stock call against.
 *
 * Platform orders are read from `orders` / `order_items` / `order_revisions`.
 * A Convex order is read through the deployment's internal query with the
 * deploy key only the platform holds; that query returns the lines and the
 * order's edit counter but not its edits, so `hasRevisionHistory` is false. A
 * store with no deploy key, or an order held in the tenant's own Supabase
 * project, cannot be checked at all and answers `unverifiable`: the route then
 * keeps the behaviour it had before lines were checked, and says so in its log.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import type { OrderBackend } from '@/lib/order-backend'
import { readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { totalsByDish, type DishTotals, type OrderLineEvidence, type RevisionTotals } from './order-stock-lines'

export type OrderLineRead =
  | { kind: 'evidence'; evidence: OrderLineEvidence }
  | { kind: 'unverifiable'; reason: string }
  /** Nothing to judge by yet (the lines have not landed) or the read failed: the caller should retry. */
  | { kind: 'unreadable' }

/** An order is edited a handful of times; this only bounds a pathological one. */
const MAX_REVISIONS_READ = 200

interface LineRow {
  menu_item_id?: unknown
  menuItemId?: unknown
  quantity?: unknown
}

interface OptionHolder {
  id?: unknown
  options?: unknown
}

/** Lines as a snapshot stores them: camelCase from the apps, snake_case from older writers. */
function totalsOfSnapshot(value: unknown): DishTotals {
  if (!Array.isArray(value)) return new Map()
  return totalsByDish((value as LineRow[]).flatMap((row) => {
    const dish = row?.menuItemId ?? row?.menu_item_id
    const quantity = Number(row?.quantity)
    return typeof dish === 'string' && Number.isFinite(quantity) && quantity > 0
      ? [{ menuItemId: dish, quantity }]
      : []
  }))
}

function idsOf(holders: unknown): string[] {
  if (!Array.isArray(holders)) return []
  return (holders as OptionHolder[]).flatMap((holder) => (typeof holder?.id === 'string' ? [holder.id] : []))
}

/** Every option/add-on id a menu row offers, across the unified, grouped and legacy shapes. */
function optionIdsOfMenuRow(row: Record<string, unknown>): Set<string> {
  const groups = [...(Array.isArray(row.modifier_groups) ? row.modifier_groups : []),
    ...(Array.isArray(row.variation_types) ? row.variation_types : [])] as OptionHolder[]
  return new Set([
    ...groups.flatMap((group) => idsOf(group?.options)),
    ...idsOf(row.variations),
    ...idsOf(row.addons),
  ])
}

async function readMenuOptionIds(
  supabase: SupabaseClient,
  tenantId: string,
  dishIds: readonly string[],
): Promise<Map<string, ReadonlySet<string>>> {
  if (dishIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, modifier_groups, variation_types, variations, addons')
    .eq('tenant_id', tenantId)
    .in('id', [...dishIds])
  if (error) throw error
  return new Map((data ?? []).map((row: Record<string, unknown>) => [String(row.id), optionIdsOfMenuRow(row)]))
}

function selectionIdsOf(customerData: unknown): Map<string, ReadonlySet<string>> {
  const byDish = new Map<string, Set<string>>()
  for (const line of readInventorySelectionSnapshot(customerData) ?? []) {
    const ids = byDish.get(line.menuItemId) ?? new Set<string>()
    for (const id of [...(line.optionIds ?? []), ...(line.addonIds ?? [])]) ids.add(id)
    byDish.set(line.menuItemId, ids)
  }
  return byDish
}

async function readPlatform(tenantId: string, orderId: string, dishIds: readonly string[]): Promise<OrderLineRead> {
  const supabase = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient
  const [order, items, revisions, menuOptionIds] = await Promise.all([
    supabase.from('orders').select('revision_number, customer_data').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('order_items').select('menu_item_id, quantity').eq('order_id', orderId),
    supabase.from('order_revisions').select('revision_number, items_before, items_after')
      .eq('order_id', orderId).eq('tenant_id', tenantId)
      .order('revision_number', { ascending: false }).limit(MAX_REVISIONS_READ),
    readMenuOptionIds(supabase, tenantId, dishIds),
  ])
  const failure = order.error ?? items.error ?? revisions.error
  if (failure) throw failure
  if (!order.data) return { kind: 'unreadable' }

  const current = totalsOfSnapshot(items.data)
  const history = (revisions.data ?? []) as Array<{ revision_number: number; items_before: unknown; items_after: unknown }>
  // An order is never saved with no lines, so none yet means they have not landed.
  if (current.size === 0 && history.length === 0) return { kind: 'unreadable' }

  const revisionsByNumber = new Map<number, RevisionTotals>(history.map((row) => [
    Number(row.revision_number),
    { before: totalsOfSnapshot(row.items_before), after: totalsOfSnapshot(row.items_after) },
  ]))
  const revisionNumber = Number((order.data as { revision_number?: unknown }).revision_number)
  return {
    kind: 'evidence',
    evidence: {
      current,
      revisionNumber: Number.isInteger(revisionNumber) ? revisionNumber : null,
      revisions: revisionsByNumber,
      hasRevisionHistory: true,
      selectionIds: selectionIdsOf((order.data as { customer_data?: unknown }).customer_data),
      menuOptionIds,
    },
  }
}

async function readConvex(tenantId: string, orderId: string, dishIds: readonly string[]): Promise<OrderLineRead> {
  const supabase = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
  const { data: tenant } = await supabase.from('tenants').select('convex_deployment_url').eq('id', tenantId).maybeSingle()
  const deployKey = (await getTenantSecrets(supabase, tenantId))?.convex_deploy_key
  const url = (tenant as { convex_deployment_url?: string | null } | null)?.convex_deployment_url
  if (!url || !deployKey) return { kind: 'unverifiable', reason: 'convex_unconfigured' }

  const order = await createConvexServerClient(url, deployKey).query<{
    items?: unknown
    revisionNumber?: unknown
    customerData?: unknown
  } | null>('orders:getOrderByIdInternal', { orderId })
  if (!order) return { kind: 'unreadable' }

  const current = totalsOfSnapshot(order.items)
  if (current.size === 0) return { kind: 'unreadable' }

  return {
    kind: 'evidence',
    evidence: {
      current,
      revisionNumber: typeof order.revisionNumber === 'number' ? order.revisionNumber : 0,
      revisions: new Map(),
      hasRevisionHistory: false,
      selectionIds: selectionIdsOf(order.customerData),
      menuOptionIds: await readMenuOptionIds(supabase as unknown as SupabaseClient, tenantId, dishIds),
    },
  }
}

export async function readOrderLineEvidence(
  backend: OrderBackend,
  tenantId: string,
  orderId: string,
  dishIds: readonly string[],
): Promise<OrderLineRead> {
  if (backend === 'platform') return readPlatform(tenantId, orderId, dishIds)
  if (backend === 'convex') return readConvex(tenantId, orderId, dishIds)
  return { kind: 'unverifiable', reason: 'own_supabase_backend' }
}
