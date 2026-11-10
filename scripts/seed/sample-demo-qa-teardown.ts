/**
 * Undo scripts/seed/sample-demo-qa.ts on `sample-demo` ONLY.
 *
 *   npx tsx scripts/seed/sample-demo-qa-teardown.ts            # print, then delete
 *   npx tsx scripts/seed/sample-demo-qa-teardown.ts --dry-run  # print only
 *
 * Deletes the seed's deterministic ids, orders an E2E run placed with a
 * `QA-SEED` customer name, the fake-phone guests those orders created, the QA
 * login (if one was made), and restores the tenant columns from the snapshot.
 */
import { existsSync, readFileSync, unlinkSync } from 'fs'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fieldId,
  IDS,
  QA_TAG,
  type QaTenant,
  resolveQaTenant,
  seedOrderIds,
  serviceClient,
  SNAPSHOT_COLUMNS,
  SNAPSHOT_PATH,
} from './sample-demo-qa-lib'

const isDryRun = process.argv.includes('--dry-run')
const QA_LOGIN_EMAIL = 'qa+sample-demo@webnegosyo.test'
const FAKE_PHONE_PATTERN = '+6390000000%'
const FIELD_KEYS = ['delivery:cutlery', 'delivery:gift', 'pickup:day', 'pickup:bag', 'dine_in:birthday']

/** A side table that may not exist on every project: a missing one is skipped, anything else throws. */
async function deleteIn(db: SupabaseClient, table: string, column: string, values: string[], tenantId?: string): Promise<number> {
  if (!values.length) return 0
  let query = db.from(table).delete().in(column, values)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query.select()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703') {
      console.log(`  - ${table}: skipped (${error.message})`)
      return 0
    }
    throw new Error(`${table}: ${error.message}`)
  }
  console.log(`  ✓ ${table}: deleted ${data?.length ?? 0}`)
  return data?.length ?? 0
}

/** The store activity log is an audit trail; a refusal there is reported, never fatal. */
async function softDeleteActivity(db: SupabaseClient, tenantId: string, orderIds: string[]) {
  const seeded = [...orderIds, ...Object.values(IDS.items), ...Object.values(IDS.vouchers), ...Object.values(IDS.movements)]
  try {
    await deleteIn(db, 'store_activity', 'external_order_id', orderIds, tenantId)
    await deleteIn(db, 'store_activity', 'source_id', seeded, tenantId)
  } catch (error) {
    console.log(`  - store_activity left in place (${error instanceof Error ? error.message : String(error)})`)
  }
}

async function qaOrderIds(db: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data, error } = await db.from('orders').select('id').eq('tenant_id', tenantId).ilike('customer_name', `${QA_TAG}%`).limit(1000)
  if (error) throw new Error(`orders read: ${error.message}`)
  return [...new Set([...seedOrderIds(), ...(data as { id: string }[]).map((row) => row.id)])]
}

async function deleteOrders(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nOrders')
  const ids = await qaOrderIds(db, tenant.id)
  console.log(`  ${ids.length} QA order id(s)`)
  await deleteIn(db, 'order_stock_applications', 'order_id', ids, tenant.id)
  await deleteIn(db, 'loyalty_earning_jobs', 'external_order_id', ids, tenant.id)
  await deleteIn(db, 'order_status_events', 'external_order_id', ids, tenant.id)
  await deleteIn(db, 'voucher_redemptions', 'order_id', ids, tenant.id)
  await deleteIn(db, 'orders', 'id', ids, tenant.id)
  await softDeleteActivity(db, tenant.id, ids)

  const { data, error } = await db.from('customers').delete().eq('tenant_id', tenant.id).like('phone_e164', FAKE_PHONE_PATTERN).select('id')
  if (error) throw new Error(`customers: ${error.message}`)
  console.log(`  ✓ customers (fake phones): deleted ${data?.length ?? 0}`)
}

async function deleteInventory(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nInventory')
  const items = Object.values(IDS.inventory)
  // The ledger has no cascade: movements (incl. E2E sales) go first.
  await deleteIn(db, 'stock_movements', 'inventory_item_id', items, tenant.id)
  await deleteIn(db, 'recipe_components', 'id', Object.values(IDS.recipeComponents), tenant.id)
  await deleteIn(db, 'recipes', 'id', Object.values(IDS.recipes), tenant.id)
  await deleteIn(db, 'inventory_items', 'id', items, tenant.id)
}

async function deleteCatalog(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nVouchers, questions, menu')
  await deleteIn(db, 'vouchers', 'id', Object.values(IDS.vouchers), tenant.id)
  await deleteIn(db, 'customer_form_fields', 'id', FIELD_KEYS.map(fieldId), tenant.id)
  await deleteIn(db, 'menu_items', 'id', Object.values(IDS.items), tenant.id)
  await deleteIn(db, 'categories', 'id', [IDS.category], tenant.id)
}

async function restoreTenant(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nTenant columns')
  if (!existsSync(SNAPSHOT_PATH)) {
    console.log(`  - no snapshot at ${SNAPSHOT_PATH}; tenant columns left as they are`)
    return
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as { tenantId: string; columns: Record<string, unknown> }
  if (snapshot.tenantId !== tenant.id) throw new Error('Snapshot belongs to another tenant; refusing to restore it')
  const restore = Object.fromEntries(SNAPSHOT_COLUMNS.map((column) => [column, snapshot.columns[column] ?? null]))
  const { data, error } = await db.from('tenants').update(restore).eq('id', tenant.id).eq('slug', tenant.slug).select('id')
  if (error) throw new Error(`tenants restore: ${error.message}`)
  if (data?.length !== 1) throw new Error(`tenants restore: expected 1 row, got ${data?.length ?? 0}`)
  console.log(`  ✓ restored ${SNAPSHOT_COLUMNS.length} columns`)
  unlinkSync(SNAPSHOT_PATH)
}

async function deleteQaLogin(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nQA login')
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`auth users: ${error.message}`)
  const user = data.users.find((u) => u.email === QA_LOGIN_EMAIL)
  if (!user) {
    console.log('  - none')
    return
  }
  await deleteIn(db, 'app_users', 'user_id', [user.id], tenant.id)
  const { error: deleteError } = await db.auth.admin.deleteUser(user.id)
  if (deleteError) throw new Error(`auth delete: ${deleteError.message}`)
  console.log(`  ✓ deleted ${QA_LOGIN_EMAIL}`)
}

async function main() {
  const db = serviceClient()
  const tenant = await resolveQaTenant(db)
  const orders = await qaOrderIds(db, tenant.id)
  console.log(`Tenant: ${tenant.name} (${tenant.slug}, ${tenant.id})`)
  console.log('Will delete: QA orders (' + orders.length + ' ids incl. E2E "QA-SEED" orders) + their stock/loyalty/voucher side rows,')
  console.log(`  fake-phone customers (${FAKE_PHONE_PATTERN}), 2 inventory items + ledger, 2 recipes, 3 vouchers, 5 questions, 4 menu items, 1 category,`)
  console.log(`  the QA login ${QA_LOGIN_EMAIL} if present; then restore tenant columns from ${SNAPSHOT_PATH}.`)
  if (isDryRun) {
    console.log('\n--dry-run: nothing deleted.')
    return
  }
  await deleteOrders(db, tenant)
  await deleteInventory(db, tenant)
  await deleteCatalog(db, tenant)
  await restoreTenant(db, tenant)
  await deleteQaLogin(db, tenant)
  console.log('\nTeardown done.')
}

main().catch((error) => {
  console.error(`\nTeardown failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
