/**
 * QA seed for the `sample-demo` tenant (platform backend) ONLY.
 *
 *   npx tsx scripts/seed/sample-demo-qa.ts            # print the plan, then write
 *   npx tsx scripts/seed/sample-demo-qa.ts --dry-run  # print the plan only
 *
 * Idempotent: deterministic ids (see sample-demo-qa-lib.ts), so a re-run
 * updates the same rows. Re-running also restores the seeded Page Designer
 * designs after a manual test changed them. Undo with
 * `npx tsx scripts/seed/sample-demo-qa-teardown.ts`.
 */
import { createHmac } from 'crypto'
import { existsSync, writeFileSync } from 'fs'

import type { SupabaseClient } from '@supabase/supabase-js'

import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import type { PageId } from '@/lib/page-designer/types'

import {
  assertRows,
  fakePhone,
  fieldId,
  IDS,
  orderId,
  orderItemId,
  QA_TAG,
  type QaTenant,
  resolveQaTenant,
  seedOrderIds,
  serviceClient,
  SNAPSHOT_COLUMNS,
  SNAPSHOT_PATH,
} from './sample-demo-qa-lib'

const isDryRun = process.argv.includes('--dry-run')
const TAG_NOTE = `[${QA_TAG}] seeded by scripts/seed/sample-demo-qa.ts`

/** Which gallery template each page is seeded with (all from the real registry). */
const PAGE_TEMPLATE_IDS: Readonly<Record<PageId, string>> = {
  checkout: 'delivery-app',
  confirmation: 'delivery-app',
  tracking: 'delivery-app',
}

/** Near the store (Lucena City), for pinned delivery orders. */
const PIN = { lat: 13.9373, lng: 121.617 }
const HOUR_MS = 60 * 60 * 1000

// ── Menu ────────────────────────────────────────────────────────────────────

function menuRows(tenantId: string) {
  const base = { tenant_id: tenantId, category_id: IDS.category, image_url: '', is_featured: false, modifier_groups: [] }
  return [
    {
      ...base,
      id: IDS.items.inasal,
      name: 'QA Chicken Inasal',
      description: `Grilled chicken with java rice. ${TAG_NOTE}`,
      price: 189,
      order: 1,
      is_featured: true,
      variations: [],
      variation_types: [
        {
          id: 'qa-vt-size',
          name: 'Size',
          is_required: true,
          display_order: 0,
          options: [
            { id: 'qa-opt-regular', name: 'Regular', price_modifier: 0, is_default: true, display_order: 0 },
            { id: 'qa-opt-large', name: 'Large', price_modifier: 40, is_default: false, display_order: 1 },
          ],
        },
        {
          id: 'qa-vt-part',
          name: 'Part',
          is_required: true,
          display_order: 1,
          options: [
            { id: 'qa-opt-paa', name: 'Paa (leg)', price_modifier: 0, is_default: true, display_order: 0 },
            { id: 'qa-opt-pecho', name: 'Pecho (breast)', price_modifier: 15, is_default: false, display_order: 1 },
          ],
        },
      ],
      addons: [
        { id: 'qa-addon-rice', name: 'Extra rice', price: 20 },
        { id: 'qa-addon-sauce', name: 'Java sauce', price: 15 },
      ],
    },
    {
      ...base,
      id: IDS.items.coffee,
      name: 'QA Iced Coffee',
      description: `Legacy flat variations. ${TAG_NOTE}`,
      price: 120,
      order: 2,
      variations: [
        { id: 'qa-var-12oz', name: '12 oz', price_modifier: 0, is_default: true },
        { id: 'qa-var-16oz', name: '16 oz', price_modifier: 30, is_default: false },
      ],
      variation_types: [],
      addons: [{ id: 'qa-addon-shot', name: 'Extra shot', price: 25 }],
    },
    {
      ...base,
      id: IDS.items.fries,
      name: 'QA Fries',
      description: `Target of the unit-limited voucher QA50FRIES (50% off ONE). ${TAG_NOTE}`,
      price: 80,
      order: 3,
      variations: [],
      variation_types: [],
      addons: [],
    },
    {
      ...base,
      id: IDS.items.cheeseBread,
      name: 'QA Cheese Bread',
      description: `Recipe: 1 QA Bread Roll (only 3 in stock). ${TAG_NOTE}`,
      price: 45,
      order: 4,
      variations: [],
      variation_types: [],
      addons: [],
    },
  ]
}

async function seedMenu(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nMenu')
  const { data: cat, error: catError } = await db
    .from('categories')
    .upsert({ id: IDS.category, tenant_id: tenant.id, name: 'QA Seed Menu', description: TAG_NOTE, order: 0, is_active: true })
    .select('id')
  if (catError) throw new Error(`categories: ${catError.message}`)
  assertRows('categories upsert', cat, 1)

  // A re-run must not put back on sale a dish the store (or auto-86) took off.
  const { data: existing, error: readError } = await db.from('menu_items').select('id').in('id', Object.values(IDS.items))
  if (readError) throw new Error(`menu_items read: ${readError.message}`)
  const known = new Set((existing as { id: string }[]).map((row) => row.id))
  const items = menuRows(tenant.id).map((row) => (known.has(row.id) ? row : { ...row, is_available: true }))
  const { data, error } = await db.from('menu_items').upsert(items, { defaultToNull: false }).select('id')
  if (error) throw new Error(`menu_items: ${error.message}`)
  assertRows('menu_items upsert', data, items.length)
}

// ── Checkout questions ──────────────────────────────────────────────────────

interface OrderTypeRow {
  id: string
  type: string
  name: string
}

async function readOrderTypes(db: SupabaseClient, tenantId: string): Promise<Record<string, OrderTypeRow>> {
  const { data, error } = await db.from('order_types').select('id, type, name').eq('tenant_id', tenantId)
  if (error) throw new Error(`order_types: ${error.message}`)
  const byType = Object.fromEntries((data as OrderTypeRow[]).map((row) => [row.type, row]))
  for (const type of ['delivery', 'pickup', 'dine_in']) {
    if (!byType[type]) throw new Error(`sample-demo has no "${type}" order type`)
  }
  return byType
}

function questionRows(tenantId: string, types: Record<string, OrderTypeRow>) {
  const row = (key: string, type: string, field: Record<string, unknown>) => ({
    id: fieldId(key),
    tenant_id: tenantId,
    order_type_id: types[type].id,
    is_required: false,
    placeholder: null,
    validation_rules: {},
    options: [],
    ...field,
  })
  return [
    row('delivery:cutlery', 'delivery', { field_name: 'qa_cutlery', field_label: 'Need cutlery? (QA)', field_type: 'choice', options: ['Yes, please', 'No, thanks'], order_index: 20 }),
    row('delivery:gift', 'delivery', { field_name: 'qa_gift_wrap', field_label: 'Gift wrap it (QA)', field_type: 'checkbox', order_index: 21 }),
    row('pickup:day', 'pickup', { field_name: 'qa_pickup_day', field_label: 'Pickup day (QA)', field_type: 'date', order_index: 20 }),
    row('pickup:bag', 'pickup', { field_name: 'qa_bag', field_label: 'Bag size (QA)', field_type: 'choice', options: ['Small', 'Large'], order_index: 21 }),
    row('dine_in:birthday', 'dine_in', { field_name: 'qa_birthday', field_label: 'Someone’s birthday today (QA)', field_type: 'checkbox', order_index: 20 }),
  ]
}

async function seedQuestions(db: SupabaseClient, tenant: QaTenant, types: Record<string, OrderTypeRow>) {
  console.log('\nCheckout questions')
  const rows = questionRows(tenant.id, types)
  const { data, error } = await db.from('customer_form_fields').upsert(rows).select('id')
  if (error) throw new Error(`customer_form_fields: ${error.message}`)
  assertRows('customer_form_fields upsert', data, rows.length)
}

// ── Vouchers ────────────────────────────────────────────────────────────────

async function seedVouchers(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nVouchers')
  const base = { tenant_id: tenant.id, description: TAG_NOTE, is_active: true, is_stackable: false, min_order_amount: 0, channels: ['checkout', 'pos', 'admin'] }
  const rows = [
    { ...base, id: IDS.vouchers.tenOff, code: 'QA10OFF', name: 'QA 10% off', discount_type: 'percent', discount_value: 10, max_discount_amount: 100, scope: 'universal', max_discounted_units: null },
    { ...base, id: IDS.vouchers.halfFries, code: 'QA50FRIES', name: 'QA 50% off one fries', discount_type: 'percent', discount_value: 50, max_discount_amount: null, scope: 'products', max_discounted_units: 1 },
    { ...base, id: IDS.vouchers.twentyPeso, code: 'QA20PESO', name: 'QA ₱20 off', discount_type: 'fixed', discount_value: 20, max_discount_amount: null, scope: 'universal', min_order_amount: 150, max_discounted_units: null },
  ]
  const { data, error } = await db.from('vouchers').upsert(rows).select('id')
  if (error) throw new Error(`vouchers: ${error.message}`)
  assertRows('vouchers upsert', data, rows.length)

  const { data: target, error: targetError } = await db
    .from('voucher_targets')
    .upsert({ id: IDS.voucherTargetFries, voucher_id: IDS.vouchers.halfFries, target_type: 'menu_item', target_id: IDS.items.fries })
    .select('id')
  if (targetError) throw new Error(`voucher_targets: ${targetError.message}`)
  assertRows('voucher_targets upsert', target, 1)
}

// ── Inventory ───────────────────────────────────────────────────────────────

async function pieceUnitId(db: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await db.from('inventory_units').select('id').eq('tenant_id', tenantId).eq('abbreviation', 'pc').maybeSingle()
  if (error || !data) throw new Error(`inventory_units (pc): ${error?.message ?? 'not found'}`)
  return (data as { id: string }).id
}

async function seedInventory(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nInventory')
  const pc = await pieceUnitId(db, tenant.id)
  const items = [
    { id: IDS.inventory.breadRoll, tenant_id: tenant.id, name: 'QA Bread Roll', sku: 'QA-BREAD', category: QA_TAG, stock_unit_id: pc, unit_cost: 8, is_prep: false, reorder_level: 5, is_active: true },
    { id: IDS.inventory.chickenLeg, tenant_id: tenant.id, name: 'QA Chicken Leg', sku: 'QA-CHICKEN', category: QA_TAG, stock_unit_id: pc, unit_cost: 55, is_prep: false, reorder_level: 10, is_active: true },
  ]
  // current_qty is never written here: it belongs to apply_stock_movement.
  const { data, error } = await db.from('inventory_items').upsert(items).select('id')
  if (error) throw new Error(`inventory_items: ${error.message}`)
  assertRows('inventory_items upsert', data, items.length)

  const recipes = [
    { id: IDS.recipes.cheeseBread, tenant_id: tenant.id, target_type: 'menu_item', menu_item_id: IDS.items.cheeseBread, notes: TAG_NOTE },
    { id: IDS.recipes.inasal, tenant_id: tenant.id, target_type: 'menu_item', menu_item_id: IDS.items.inasal, notes: TAG_NOTE },
  ]
  const { data: rec, error: recError } = await db.from('recipes').upsert(recipes).select('id')
  if (recError) throw new Error(`recipes: ${recError.message}`)
  assertRows('recipes upsert', rec, recipes.length)

  const components = [
    { id: IDS.recipeComponents.cheeseBread, tenant_id: tenant.id, recipe_id: IDS.recipes.cheeseBread, inventory_item_id: IDS.inventory.breadRoll, quantity: 1, unit_id: pc, sort_order: 0 },
    { id: IDS.recipeComponents.inasal, tenant_id: tenant.id, recipe_id: IDS.recipes.inasal, inventory_item_id: IDS.inventory.chickenLeg, quantity: 1, unit_id: pc, sort_order: 0 },
  ]
  const { data: comp, error: compError } = await db.from('recipe_components').upsert(components).select('id')
  if (compError) throw new Error(`recipe_components: ${compError.message}`)
  assertRows('recipe_components upsert', comp, components.length)

  // Opening stock through the ledger (service role), once per item.
  const movements = [
    { id: IDS.movements.breadRoll, inventory_item_id: IDS.inventory.breadRoll, quantity_delta: 3, unit_cost: 8 },
    { id: IDS.movements.chickenLeg, inventory_item_id: IDS.inventory.chickenLeg, quantity_delta: 20, unit_cost: 55 },
  ]
  const { data: existing, error: readError } = await db.from('stock_movements').select('id').in('id', movements.map((m) => m.id))
  if (readError) throw new Error(`stock_movements read: ${readError.message}`)
  const done = new Set((existing as { id: string }[]).map((row) => row.id))
  const todo = movements.filter((m) => !done.has(m.id))
  if (!todo.length) {
    console.log('  ✓ stock_movements: opening stock already received')
    return
  }
  const rows = todo.map((m) => ({ ...m, tenant_id: tenant.id, reason: 'receive', entered_quantity: m.quantity_delta, entered_unit_id: pc, note: TAG_NOTE }))
  const { data: mv, error: mvError } = await db.from('stock_movements').insert(rows).select('id')
  if (mvError) throw new Error(`stock_movements: ${mvError.message}`)
  assertRows('stock_movements insert (receive)', mv, rows.length)
}

// ── Orders ──────────────────────────────────────────────────────────────────

interface Line {
  itemId: string
  name: string
  price: number
  quantity: number
  variation?: string
  addons?: string[]
  category: string
}

interface OrderSpec {
  n: number
  type: 'delivery' | 'pickup' | 'dine_in'
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  hoursAgo: number
  guest: string
  lines: Line[]
  deliveryFee?: number
  extra?: Record<string, string>
  paid?: boolean
  cancelReason?: string
}

const L = {
  inasal: (q = 1): Line => ({ itemId: IDS.items.inasal, name: 'QA Chicken Inasal', price: 189, quantity: q, variation: 'Regular, Paa (leg)', category: 'QA Seed Menu' }),
  inasalLarge: (q = 1): Line => ({ itemId: IDS.items.inasal, name: 'QA Chicken Inasal', price: 259, quantity: q, variation: 'Large, Pecho (breast)', addons: ['Java sauce'], category: 'QA Seed Menu' }),
  coffee: (q = 1): Line => ({ itemId: IDS.items.coffee, name: 'QA Iced Coffee', price: 150, quantity: q, variation: '16 oz', category: 'QA Seed Menu' }),
  fries: (q = 1): Line => ({ itemId: IDS.items.fries, name: 'QA Fries', price: 80, quantity: q, category: 'QA Seed Menu' }),
  bread: (q = 1): Line => ({ itemId: IDS.items.cheeseBread, name: 'QA Cheese Bread', price: 45, quantity: q, category: 'QA Seed Menu' }),
}

const pinned = (unit: string, landmark: string, riderNote: string, address: string): Record<string, string> => ({
  delivery_address: address,
  delivery_lat: String(PIN.lat),
  delivery_lng: String(PIN.lng),
  delivery_pin_address: address,
  delivery_pin_confirmed: 'true',
  delivery_pin_source: 'search',
  delivery_unit: unit,
  delivery_landmark: landmark,
  delivery_rider_note: riderNote,
})

const ORDERS: OrderSpec[] = [
  { n: 1, type: 'delivery', status: 'pending', hoursAgo: 0.2, guest: 'Juan', deliveryFee: 59, lines: [L.inasal(2), L.coffee()], extra: { ...pinned('Blk 4 Lot 12', 'Tapat ng sari-sari store', 'Call when outside, no doorbell', 'Quezon Ave, Lucena City'), qa_cutlery: 'Yes, please' } },
  { n: 2, type: 'delivery', status: 'confirmed', hoursAgo: 0.6, guest: 'Maria', deliveryFee: 59, lines: [L.inasalLarge(), L.fries(2)], extra: { ...pinned('Unit 3B', 'Beside the church', 'Gate code 1234', 'Merchan St, Lucena City'), delivery_store_note: 'Extra napkins in the bag' } },
  { n: 3, type: 'delivery', status: 'preparing', hoursAgo: 1, guest: 'Pedro', deliveryFee: 79, lines: [L.inasal(), L.bread(2)], extra: { ...pinned('', 'Green gate', '', 'Granja St, Lucena City'), qa_gift_wrap: 'yes' } },
  { n: 4, type: 'pickup', status: 'ready', hoursAgo: 1.5, guest: 'Ana', lines: [L.coffee(2), L.fries()], extra: { qa_bag: 'Small' } },
  { n: 5, type: 'pickup', status: 'delivered', hoursAgo: 26, guest: 'Jose', paid: true, lines: [L.inasal(), L.coffee()] },
  { n: 6, type: 'dine_in', status: 'delivered', hoursAgo: 50, guest: 'Liza', paid: true, lines: [L.inasalLarge(2), L.fries()], extra: { table_number: '7', qa_birthday: 'yes' } },
  { n: 7, type: 'delivery', status: 'cancelled', hoursAgo: 72, guest: 'Carlo', deliveryFee: 59, cancelReason: 'QA seed: guest cancelled', lines: [L.fries(3)], extra: pinned('Rm 201', 'Near the plaza', '', 'Rizal St, Lucena City') },
  // Legacy "I can't find my place" order (the button is off since 2026-11-10; the admin banner still reads old orders).
  { n: 8, type: 'delivery', status: 'pending', hoursAgo: 0.1, guest: 'Bea', deliveryFee: 0, lines: [L.inasal(), L.fries()], extra: { delivery_address: 'Purok 3, Brgy. Ibabang Dupay, Lucena', delivery_pin_skipped: 'true', delivery_landmark: 'Blue house after the basketball court' } },
  { n: 9, type: 'dine_in', status: 'pending', hoursAgo: 0.3, guest: 'Miguel', lines: [L.coffee(), L.bread()], extra: { table_number: '3' } },
  { n: 10, type: 'pickup', status: 'confirmed', hoursAgo: 0.8, guest: 'Rosa', lines: [L.inasal(3)], extra: { qa_pickup_day: new Date(Date.now() + 24 * HOUR_MS).toISOString().slice(0, 10), qa_bag: 'Large' } },
  { n: 11, type: 'delivery', status: 'delivered', hoursAgo: 30, guest: 'Ramon', deliveryFee: 59, paid: true, lines: [L.inasalLarge(), L.coffee(2)], extra: pinned('House 9', 'Across the bakery', 'Leave with the guard', 'Gomez St, Lucena City') },
  { n: 12, type: 'pickup', status: 'cancelled', hoursAgo: 96, guest: 'Tess', cancelReason: 'QA seed: out of stock', lines: [L.bread(4)] },
]

interface PaymentMethodRow {
  id: string
  name: string
}

async function readCashMethod(db: SupabaseClient, tenantId: string): Promise<PaymentMethodRow> {
  const { data, error } = await db.from('payment_methods').select('id, name, require_payment_proof').eq('tenant_id', tenantId).eq('is_active', true)
  if (error) throw new Error(`payment_methods: ${error.message}`)
  const rows = data as (PaymentMethodRow & { require_payment_proof: boolean })[]
  const method = rows.find((row) => !row.require_payment_proof) ?? rows[0]
  if (!method) throw new Error('sample-demo has no active payment method')
  return method
}

function orderRows(tenant: QaTenant, types: Record<string, OrderTypeRow>, method: PaymentMethodRow) {
  return ORDERS.map((spec) => {
    const subtotal = spec.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    const fee = spec.deliveryFee ?? 0
    const total = subtotal + fee
    const phone = fakePhone(spec.n)
    const name = `${QA_TAG} ${spec.guest}`
    const at = new Date(Date.now() - spec.hoursAgo * HOUR_MS).toISOString()
    return {
      id: orderId(spec.n),
      tenant_id: tenant.id,
      customer_name: name,
      customer_contact: phone,
      total,
      status: spec.status,
      created_at: at,
      order_type_id: types[spec.type].id,
      order_type: types[spec.type].name,
      delivery_fee: fee,
      payment_method_id: method.id,
      payment_method_name: method.name,
      payment_status: spec.paid ? 'paid' : 'pending',
      amount_paid: spec.paid ? total : 0,
      source: 'web',
      item_count: spec.lines.reduce((sum, line) => sum + line.quantity, 0),
      cancel_reason: spec.cancelReason ?? null,
      customer_data: {
        customer_name: name,
        customer_phone: phone,
        sms_consent: false,
        sms_consent_at: null,
        qa_seed: QA_TAG,
        ...(spec.extra ?? {}),
      },
    }
  })
}

function orderItemRows() {
  return ORDERS.flatMap((spec) =>
    spec.lines.map((line, index) => ({
      id: orderItemId(spec.n, index),
      order_id: orderId(spec.n),
      menu_item_id: line.itemId,
      menu_item_name: line.name,
      variation: line.variation ?? null,
      addons: line.addons ?? [],
      quantity: line.quantity,
      price: line.price,
      subtotal: line.price * line.quantity,
      discount_amount: 0,
    })),
  )
}

async function seedOrders(db: SupabaseClient, tenant: QaTenant, types: Record<string, OrderTypeRow>) {
  console.log('\nOrders')
  const method = await readCashMethod(db, tenant.id)
  const orders = orderRows(tenant, types, method)
  const { data, error } = await db.from('orders').upsert(orders).select('id')
  if (error) throw new Error(`orders: ${error.message}`)
  assertRows('orders upsert', data, orders.length)

  const items = orderItemRows()
  const { data: lines, error: linesError } = await db.from('order_items').upsert(items).select('id')
  if (linesError) throw new Error(`order_items: ${linesError.message}`)
  assertRows('order_items upsert', lines, items.length)

  // A line dropped from the spec stays in the table under upsert: remove it, so
  // a re-run leaves exactly the lines (and totals) above.
  const keep = new Set(items.map((item) => item.id))
  const { data: stored, error: storedError } = await db.from('order_items').select('id').in('order_id', seedOrderIds())
  if (storedError) throw new Error(`order_items read: ${storedError.message}`)
  const stale = (stored as { id: string }[]).map((row) => row.id).filter((id) => !keep.has(id))
  if (stale.length) {
    const { data: gone, error: goneError } = await db.from('order_items').delete().in('id', stale).select('id')
    if (goneError) throw new Error(`order_items delete: ${goneError.message}`)
    assertRows('order_items delete (stale)', gone, stale.length)
  }

  await deductSeededStock(tenant)
}

/**
 * The seed writes orders straight into the table, so checkout's own stock
 * deduction never runs, and the sweep skips anything older than 24 hours.
 * Spend each live order through the SAME claimed depletion checkout uses; the
 * claim makes a re-run (or an order the sweep already took) a no-op.
 */
async function deductSeededStock(tenant: QaTenant) {
  const { applyOrderStockBestEffort } = await import('@/lib/inventory/order-stock-service')
  const { buildDepletionItemsFromOrderRows } = await import('@/lib/inventory/customer-order-items')
  const live = ORDERS.filter((spec) => spec.status !== 'cancelled')
  for (const spec of live) {
    const rows = spec.lines.map((line) => ({ menu_item_id: line.itemId, quantity: line.quantity }))
    const outcome = await applyOrderStockBestEffort(tenant.id, orderId(spec.n), buildDepletionItemsFromOrderRows(rows), 'sale', 0, null, { context: { source: 'system' } })
    if (outcome === 'failed') throw new Error(`stock deduction failed for order #${spec.n}`)
  }
  console.log(`  ✓ stock: ${live.length} live orders deducted (already-deducted ones are no-ops)`)
}

// ── Tenant columns: snapshot, then Page Designer designs ────────────────────

async function snapshotTenant(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nSnapshot')
  if (existsSync(SNAPSHOT_PATH)) {
    console.log(`  ✓ kept the existing snapshot (${SNAPSHOT_PATH}) — it holds the pre-seed values`)
    return
  }
  const { data, error } = await db.from('tenants').select(SNAPSHOT_COLUMNS.join(', ')).eq('id', tenant.id).single()
  if (error || !data) throw new Error(`snapshot read: ${error?.message ?? 'no row'}`)
  writeFileSync(SNAPSHOT_PATH, JSON.stringify({ tenantId: tenant.id, slug: tenant.slug, takenAt: new Date().toISOString(), columns: data }, null, 2))
  console.log(`  ✓ saved ${SNAPSHOT_COLUMNS.length} tenant columns to ${SNAPSHOT_PATH}`)
}

/** Build a design from the real template registry and validate it like publish does. */
export function buildSeedDesign(page: PageId): string {
  const template = PAGE_TEMPLATES[page].find((t) => t.id === PAGE_TEMPLATE_IDS[page])
  if (!template) throw new Error(`No "${PAGE_TEMPLATE_IDS[page]}" template for ${page}`)
  const parsed = heroDesignV5Schema.safeParse(template.build())
  if (!parsed.success) throw new Error(`${page} template failed the schema: ${parsed.error.issues[0]?.message}`)
  const problem = pageDesignProblem(parsed.data, page)
  if (problem) throw new Error(`${page} template refused: ${problem}`)
  return JSON.stringify(parsed.data)
}

async function seedTenantColumns(db: SupabaseClient, tenant: QaTenant) {
  console.log('\nTenant columns (Page Designer + tracking style)')
  const update = {
    checkout_design: buildSeedDesign('checkout'),
    checkout_design_enabled: true,
    confirmation_design: buildSeedDesign('confirmation'),
    confirmation_design_enabled: true,
    tracking_design: buildSeedDesign('tracking'),
    tracking_design_enabled: true,
    tracking_style: { accent: '#e11d48', hero_style: 'soft', corners: 'soft' },
    // The thank-you page stays up for a few seconds, so the designed page is seen.
    confirmation_redirect: 'countdown',
    confirmation_redirect_seconds: 8,
    auto_86_enabled: true,
  }
  const { data, error } = await db.from('tenants').update(update).eq('id', tenant.id).eq('slug', tenant.slug).select('id')
  if (error) throw new Error(`tenants: ${error.message}`)
  assertRows('tenants update (sample-demo only)', data, 1)
}

// ── Plan + run ──────────────────────────────────────────────────────────────

function printPlan(tenant: QaTenant) {
  console.log(`Tenant: ${tenant.name} (${tenant.slug}, ${tenant.id}, backend=${tenant.order_backend})`)
  console.log('Will write (every row tagged / deterministic id):')
  console.log('  categories          1  "QA Seed Menu"')
  console.log('  menu_items          4  QA Chicken Inasal (variation types + add-ons), QA Iced Coffee (legacy variations), QA Fries, QA Cheese Bread')
  console.log('  customer_form_fields 5 qa_* questions: choice + checkbox (delivery), date + choice (pickup), checkbox (dine-in)')
  console.log('  vouchers            3  QA10OFF (10%), QA50FRIES (50% off ONE QA Fries, max_discounted_units=1), QA20PESO (₱20, min ₱150) + 1 voucher_target')
  console.log('  inventory_items     2  QA Bread Roll (3 pc), QA Chicken Leg (20 pc) + 2 recipes + 2 components + 2 receive movements (first run only)')
  console.log(`  orders             ${ORDERS.length}  pending→delivered/cancelled, incl. 6 delivery (5 pinned w/ unit/landmark/rider note, 1 with a store note, 1 pin skipped)`)
  console.log(`  order_items        ${orderItemRows().length}`)
  console.log('  tenants             1  checkout/confirmation/tracking design (delivery-app family) + *_enabled, tracking_style, confirmation_redirect=countdown 8s, auto_86_enabled=true')
  console.log(`  snapshot            ${SNAPSHOT_PATH} (only if absent)`)
  console.log(`Guest phones: ${fakePhone(1)} … ${fakePhone(ORDERS.length)} (fake), sms_consent=false, no customers rows.`)
}

async function printTrackingLinks(tenant: QaTenant) {
  const secret = process.env.API_SECRET
  if (!secret) return
  // Same HMAC as src/lib/tracking-token.ts (that module reads the secret at import time).
  console.log('\nTracking links (dev server on :3100):')
  for (const id of seedOrderIds().slice(0, 3)) {
    const token = createHmac('sha256', secret).update(id).digest('hex')
    console.log(`  http://${tenant.slug}.localhost:3100/order/${id}?t=${token}`)
  }
}

async function main() {
  const db = serviceClient()
  const tenant = await resolveQaTenant(db)
  printPlan(tenant)
  if (isDryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }
  const types = await readOrderTypes(db, tenant.id)
  await snapshotTenant(db, tenant)
  await seedMenu(db, tenant)
  await seedQuestions(db, tenant, types)
  await seedVouchers(db, tenant)
  await seedInventory(db, tenant)
  await seedOrders(db, tenant, types)
  await seedTenantColumns(db, tenant)
  await printTrackingLinks(tenant)
  console.log('\nDone.')
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
