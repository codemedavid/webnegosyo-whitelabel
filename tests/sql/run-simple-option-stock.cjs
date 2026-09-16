const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.tenants(id uuid primary key);
      create table public.menu_items(id uuid primary key, tenant_id uuid, modifier_groups jsonb);
      create table public.order_stock_applications(tenant_id uuid, order_id text, reason text, revision integer);
    `)
    await db.exec(readFileSync('supabase/migrations/20260916121000_simple_option_stock.sql', 'utf8'))
    const tenant = '11111111-1111-4111-8111-111111111111'
    const menu = '22222222-2222-4222-8222-222222222222'
    await db.query('insert into tenants values ($1)', [tenant])
    await db.query('insert into menu_items values ($1,$2,$3)', [menu, tenant, JSON.stringify([{ id: 'g', options: [{ id: 'cheese', name: 'Cheese', stock_mode: 'simple', stock_qty: 10 }] }])])
    const items = [{ menuItemId: menu, quantity: 2, addonIds: ['cheese'], addonQuantities: { cheese: 3 } }]
    const apply = (order, action, revision = 0, lines = items) => db.query('select public.apply_simple_option_order_stock($1,$2,$3,$4,$5::jsonb,$6::uuid)', [tenant, order, action, revision, JSON.stringify(lines), null])
    const stock = async () => (await db.query("select (modifier_groups->0->'options'->0->>'stock_qty')::numeric as qty from menu_items")).rows[0].qty
    await apply('order1', 'sale')
    assert.equal(await stock(), '4', 'two parents with three portions spend six')
    await apply('order1', 'sale')
    assert.equal(await stock(), '4', 'retry is idempotent')
    await apply('order1', 'cancel', 0, [])
    assert.equal(await stock(), '10', 'cancel restores recorded portions')
    await apply('order1', 'cancel', 0, [])
    await apply('order1', 'sale')
    assert.equal(await stock(), '10', 'duplicate cancel and late original sale cannot change stock')
    await apply('order1', 'sale', 1)
    assert.equal(await stock(), '4', 'reopened order consumes again at a new revision')
    await apply('order1', 'void', 2, [{ ...items[0], quantity: 1, addonQuantities: { cheese: 1 } }])
    assert.equal(await stock(), '5', 'revision restores one removed portion')
    await apply('order1', 'cancel', 0, [])
    assert.equal(await stock(), '10', 'cancel restores only the net consumed quantity')
    await assert.rejects(apply('over', 'sale', 0, [items[0], items[0]]), /Insufficient stock/)
    assert.equal(await stock(), '10', 'aggregate oversell rolls back all changes')
    await apply('over', 'sale', 0, [{ ...items[0], quantity: 1 }])
    assert.equal(await stock(), '7', 'failed claim remains retryable')
    await apply('early-cancel', 'cancel', 0, [])
    await apply('early-cancel', 'sale')
    assert.equal(await stock(), '7', 'cancel before sale prevents depletion')
    await assert.rejects(apply('fractional', 'sale', 0, [{ ...items[0], addonQuantities: { cheese: 1.5 } }]), /Invalid add-on quantity/)
    await assert.rejects(apply('missing-parent', 'sale', 0, [{ menuItemId: menu, addonIds: ['cheese'] }]), /Invalid parent quantity/)
    assert.equal(await stock(), '7', 'malformed quantities do not change counters')
    await db.exec('set role authenticated')
    await assert.rejects(apply('unauthorized', 'sale'), /permission denied/)
    await db.exec('reset role')
    const otherTenant = '33333333-3333-4333-8333-333333333333'
    await db.query('insert into tenants values ($1)', [otherTenant])
    await db.query('select public.apply_simple_option_order_stock($1,$2,$3,$4,$5::jsonb)', [otherTenant, 'wrong-tenant', 'sale', 0, JSON.stringify(items)])
    assert.equal(await stock(), '7', 'tenant scope cannot change a different menu')
    // A merchant opened the editor at stock 10; its unchanged counter is
    // omitted on save after these sales. The UPDATE must preserve live stock.
    await db.query('update menu_items set modifier_groups = $1 where id = $2', [JSON.stringify([
      { id: 'renamed-group', options: [{ id: 'cheese', name: 'Renamed cheese', stock_mode: 'simple' }] },
    ]), menu])
    assert.equal(await stock(), '7', 'unrelated editor save preserves sales committed after editor opened')
    await db.query('update menu_items set modifier_groups = $1 where id = $2', [JSON.stringify([
      { id: 'renamed-group', options: [{ id: 'cheese', name: 'Renamed cheese', stock_mode: 'simple', stock_qty: 12 }] },
    ]), menu])
    assert.equal(await stock(), '12', 'explicit merchant stock adjustment is retained')
    await apply('after-adjustment', 'sale', 0, [{ ...items[0], quantity: 1, addonQuantities: { cheese: 2 } }])
    assert.equal(await stock(), '10', 'stock RPC still changes counters after preservation trigger')
    console.log('PASS: simple option sale, retry, cancel, reopen, revision, aggregate stock, rollback and cancellation race')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
