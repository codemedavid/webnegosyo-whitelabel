/**
 * Throwaway storefronts for the multi-branch E2E run.
 *
 * These write to the same Supabase project the app uses, so everything they
 * create is namespaced under the `e2e-` slug prefix and deleted again in
 * teardown. `deleteE2ETenants` is keyed on that prefix rather than on ids kept
 * in memory, so a crashed run cannot leave rows behind for the next one to trip
 * over. Nothing here touches a row it did not create.
 *
 * Tenants are seeded inactive-but-resolvable: the storefront only needs the
 * tenant to exist, and leaving them off the platform's active lists keeps them
 * out of anything that enumerates real merchants.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Every seeded slug starts with this; teardown deletes on it. */
export const E2E_SLUG_PREFIX = 'e2e-branch'

export interface SeededTenant {
  id: string
  slug: string
  outletNames: [string, string]
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error(
      'E2E seeding needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local).'
    )
  }

  return createClient(url, serviceRole, { auth: { persistSession: false } })
}

async function insertOne<T>(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw new Error(`E2E seed failed inserting into ${table}: ${error.message}`)
  return data as T
}

/**
 * One storefront with two branches, at the given selection timing.
 *
 * Order types and their customer form fields are NOT seeded here — a database
 * trigger creates the default Dine In / Pick Up / Delivery set on tenant
 * insert, and the E2E is more honest for exercising that same path a real
 * merchant gets.
 */
export async function seedBranchTenant(
  timing: 'before' | 'after'
): Promise<SeededTenant> {
  const supabase = adminClient()
  const slug = `${E2E_SLUG_PREFIX}-${timing}`

  await deleteTenantBySlug(supabase, slug)

  const tenant = await insertOne<{ id: string }>(supabase, 'tenants', {
    name: `E2E Branches (${timing})`,
    slug,
    is_active: true,
    multi_branch_enabled: true,
    outlet_selection_timing: timing,
    primary_color: '#c41e3a',
    secondary_color: '#009246',
  })

  const category = await insertOne<{ id: string }>(supabase, 'categories', {
    tenant_id: tenant.id,
    name: 'Mains',
    is_active: true,
    order: 0,
  })

  await insertOne(supabase, 'menu_items', {
    tenant_id: tenant.id,
    category_id: category.id,
    name: 'Test Adobo',
    description: 'Seeded by the multi-branch E2E.',
    image_url: '',
    price: 180,
    is_available: true,
    order: 0,
  })

  const outletNames: [string, string] = ['Cainta Branch', 'Makati Branch']
  await Promise.all(
    outletNames.map((name, index) =>
      insertOne(supabase, 'outlets', {
        tenant_id: tenant.id,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        address: `${index + 1} E2E Street`,
        is_active: true,
        sort_order: index,
        supports_pickup: true,
        supports_delivery: true,
        supports_dine_in: true,
      })
    )
  )

  return { id: tenant.id, slug, outletNames }
}

async function deleteTenantBySlug(supabase: SupabaseClient, slug: string): Promise<void> {
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (!data) return
  await deleteTenantById(supabase, (data as { id: string }).id)
}

/**
 * Children first, then the tenant. Some of these tables cascade and some do
 * not; deleting explicitly means teardown does not depend on which.
 */
async function deleteTenantById(supabase: SupabaseClient, tenantId: string): Promise<void> {
  const { data: orders } = await supabase.from('orders').select('id').eq('tenant_id', tenantId)
  const orderIds = (orders ?? []).map((order) => (order as { id: string }).id)
  if (orderIds.length > 0) {
    await supabase.from('order_items').delete().in('order_id', orderIds)
  }

  for (const table of [
    'orders',
    'customer_form_fields',
    'order_types',
    'payment_methods',
    'menu_items',
    'categories',
    'outlets',
  ]) {
    await supabase.from(table).delete().eq('tenant_id', tenantId)
  }

  await supabase.from('tenants').delete().eq('id', tenantId)
}

/** Removes every tenant this suite could have created, crashed run or not. */
export async function deleteE2ETenants(): Promise<void> {
  const supabase = adminClient()
  const { data } = await supabase.from('tenants').select('id').like('slug', `${E2E_SLUG_PREFIX}%`)

  for (const row of data ?? []) {
    await deleteTenantById(supabase, (row as { id: string }).id)
  }
}
