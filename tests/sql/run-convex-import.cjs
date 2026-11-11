// A generated Convex→platform import SQL file, run for real against the live
// trigger set (lib/convex-import-schema.cjs) in PGlite, twice:
//   - the switch file refuses before the import
//   - the import keeps Convex daily numbers (renumbering only collisions with
//     the store's older platform orders, which stay untouched), queues no push,
//     leaves updated_at = created_at, lands every count and peso total, links
//     the customer, moves product costs where the cost snapshot reads them,
//     rekeys Convex-keyed stock claims
//   - a second run changes nothing
//   - a wrong expected total rolls EVERYTHING back; so does a store whose
//     loyalty went live after the plan
//   - the switch then succeeds and keeps the deploy key
// The SQL comes from src/lib/convex-import (the code the CLI runs), loaded
// through ts-node like the repo's scripts.
const path = require('node:path')
const assert = require('node:assert/strict')
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, REPO_ROOT } = require('./lib/platform-auth.cjs')
const { LIVE_SCHEMA } = require('./lib/convex-import-schema.cjs')

require('ts-node').register({ project: path.join(REPO_ROOT, 'scripts/tsconfig.json'), transpileOnly: true })
require(path.join(REPO_ROOT, 'scripts/register-paths.js'))
const lib = require(path.join(REPO_ROOT, 'src/lib/convex-import/index.ts'))
const fx = require(path.join(REPO_ROOT, 'tests/fixtures/convex-import/snapshot.ts'))

const CUSTOMER = '99999999-9999-4999-8999-999999999901'
const CATEGORY = '99999999-9999-4999-8999-999999999911'
const DEPLOYMENT = 'https://sample-fixture-123.convex.cloud'

async function freshDb() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(LIVE_SCHEMA)
  const snapshot = fx.buildSnapshot()
  const [o1, o2, , o4, o5] = snapshot.orders
  await db.exec(`
    insert into tenants (id, slug, order_backend, convex_deployment_url) values
      ('${fx.TENANT_ID}', '${fx.SLUG}', 'convex', '${DEPLOYMENT}'),
      ('${fx.OTHER_TENANT_ID}', 'another-store', 'platform', null);
    insert into tenant_secrets values ('${fx.TENANT_ID}', 'dev:fixture-key');
    insert into order_types (id, tenant_id, name) values
      ('${fx.DINE_IN}', '${fx.TENANT_ID}', 'Dine In'), ('${fx.PICK_UP}', '${fx.TENANT_ID}', 'Pick Up'),
      ('${fx.FOREIGN_TYPE}', '${fx.OTHER_TENANT_ID}', 'Dine In');
    insert into payment_methods values ('${fx.CASH}', '${fx.TENANT_ID}', 'Cash'), ('${fx.GCASH}', '${fx.TENANT_ID}', 'GCash');
    insert into outlets values ('${fx.OUTLET}', '${fx.TENANT_ID}');
    insert into categories values ('${CATEGORY}', '${fx.TENANT_ID}', 'Coffee');
    insert into menu_items values
      ('${fx.MENU.latte}', '${fx.TENANT_ID}', '${CATEGORY}', 'Latte'),
      ('${fx.MENU.burger}', '${fx.TENANT_ID}', '${CATEGORY}', 'Burger'),
      ('${fx.MENU.fries}', '${fx.TENANT_ID}', '${CATEGORY}', 'Fries');
    insert into product_costs (tenant_id, menu_item_id, cost_price) values ('${fx.TENANT_ID}', '${fx.MENU.burger}', 61);
    insert into customers values ('${CUSTOMER}', '${fx.TENANT_ID}');
    insert into customer_external_orders (tenant_id, customer_id, backend, external_order_id) values
      ('${fx.TENANT_ID}', '${CUSTOMER}', 'convex', '${o2._id}');
    -- Stock claims the Convex era wrote under Convex order ids.
    insert into order_stock_applications (tenant_id, order_id, reason) values ('${fx.TENANT_ID}', '${o1._id}', 'sale');
    insert into simple_option_stock_applications (tenant_id, order_id, action, revision) values ('${fx.TENANT_ID}', '${o4._id}', 'sale', 0);
    insert into stock_movements (tenant_id, order_id, reason) values
      ('${fx.TENANT_ID}', '${o1._id}', 'sale'), ('${fx.TENANT_ID}', '${o5._id}', 'sale');
    -- The Convex-era activity capture already logged o1's sale.
    insert into store_activity (tenant_id, occurred_at, kind, event_key, backend, external_order_id)
      values ('${fx.TENANT_ID}', now(), 'order.placed', 'convex:${o1._id}:placed', 'convex', '${o1._id}');
  `)
  // The store's older platform orders, written the normal way (the live trigger numbers them).
  for (const order of fx.OLD_PLATFORM_ORDERS) {
    await db.query(
      `insert into orders (id, tenant_id, total, status, created_at, client_order_id, order_type_id)
       values ($1, $2, $3, 'delivered', $4, $5, $6)`,
      [order.id, fx.TENANT_ID, order.total, order.created_at, order.client_order_id, fx.DINE_IN]
    )
  }
  return db
}

function plan() {
  const snapshot = fx.buildSnapshot()
  const [o1, o2, , o4, o5] = snapshot.orders
  return lib.buildImportPlan(
    snapshot,
    fx.buildPlatformState({
      convexKeyed: {
        order_stock_applications: [o1._id],
        simple_option_stock_applications: [o4._id],
        simple_option_stock_movements: [],
        presell_stock_applications: [],
        stock_movements: [o1._id, o5._id],
      },
      customerLinkedConvexIds: [o2._id],
      activityPlacedConvexIds: [o1._id],
    })
  )
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0]
const all = async (db, sql, params) => (await db.query(sql, params)).rows

async function stateOf(db) {
  return JSON.stringify({
    orders: await all(db, 'select * from orders order by id'),
    items: await all(db, 'select * from order_items order by id'),
    payments: await all(db, 'select * from order_payments order by id'),
    revisions: await all(db, 'select * from order_revisions order by id'),
    costs: await all(db, 'select * from product_costs order by id'),
    itemCosts: await all(db, 'select * from order_item_costs order by order_item_id'),
    activity: await all(db, 'select kind, event_key, flags from store_activity order by event_key'),
    claims: await all(db, 'select order_id, reason from order_stock_applications order by order_id'),
    options: await all(db, 'select order_id from simple_option_stock_applications order by order_id'),
    movements: await all(db, 'select order_id from stock_movements order by order_id'),
    net: await all(db, 'select url from net_calls order by id'),
    jobs: await all(db, 'select * from loyalty_earning_jobs'),
    tenants: await all(db, 'select * from tenants order by id'),
  })
}

async function main() {
  const p = plan()
  assert.equal(lib.hasBlockingProblem(p), false, JSON.stringify(p.problems))
  const importSql = lib.buildImportSql(p, { generatedAt: '2026-11-12T00:00:00.000Z', sourceLabel: 'fixture' })
  const switchSql = lib.buildSwitchSql(p, { generatedAt: '2026-11-12T00:00:00.000Z', expectedDeploymentUrl: DEPLOYMENT })
  assert.doesNotMatch(importSql, /\b(begin|commit)\s*;/i, 'the file must not carry its own transaction control')
  const db = await freshDb()
  try {
    // Control: the live push trigger really queues a call on a normal insert.
    assert.equal((await one(db, 'select count(*)::int n from net_calls')).n, fx.OLD_PLATFORM_ORDERS.length)
    await db.exec('delete from net_calls')
    const oldBefore = await all(db, 'select * from orders order by id')
    assert.deepEqual(
      oldBefore.map((o) => [o.order_date?.toISOString?.().slice(0, 10) ?? String(o.order_date), o.daily_number]).sort(),
      fx.OLD_PLATFORM_ORDERS.map((o) => [o.order_date, o.daily_number]).sort()
    )

    // 1. The switch refuses while the history is missing.
    await assert.rejects(db.exec(switchSql), /switch refused/)
    assert.equal((await one(db, `select order_backend from tenants where id = $1`, [fx.TENANT_ID])).order_backend, 'convex')

    // 2. Import.
    await db.exec(importSql)
    const imported = await all(db, `select * from orders where customer_data ? 'convex_order_id' order by created_at`)
    assert.equal(imported.length, p.rows.orders.length)
    const cents = (rows, col) => rows.reduce((sum, row) => sum + Math.round(Number(row[col]) * 100), 0)
    assert.equal(cents(imported, 'total'), p.summary.orders.cents)
    assert.equal(cents(imported, 'amount_paid'), p.summary.orders.amountPaidCents)

    // Daily numbers exactly as planned; Convex numbers kept where free.
    const planned = new Map(p.rows.orders.map((o) => [o.id, [o.order_date, o.daily_number]]))
    for (const row of imported) {
      const day = row.order_date ? row.order_date.toISOString().slice(0, 10) : null
      assert.deepEqual([day, row.daily_number], planned.get(row.id), `daily number of ${row.id}`)
    }
    const dupes = await one(db, `select count(*)::int n from (select order_date, daily_number from orders where tenant_id = $1 and daily_number is not null group by 1, 2 having count(*) > 1) d`, [fx.TENANT_ID])
    assert.equal(dupes.n, 0)

    // No push, no messenger call, no loyalty job.
    assert.equal((await one(db, 'select count(*)::int n from net_calls')).n, 0, 'restore mode must keep orders_notify_push silent')
    assert.equal((await one(db, 'select count(*)::int n from loyalty_earning_jobs')).n, 0)

    // updated_at = created_at even though payments stamped it.
    assert.equal((await one(db, `select count(*)::int n from orders where customer_data ? 'convex_order_id' and updated_at <> created_at`)).n, 0)
    // The store's older orders are untouched.
    assert.deepEqual(await all(db, `select * from orders where id = any($1::uuid[]) order by id`, [fx.OLD_PLATFORM_ORDERS.map((o) => o.id)]), oldBefore)

    // Children, ledger, links.
    const items = await all(db, `select i.* from order_items i join orders o on o.id = i.order_id where o.customer_data ? 'convex_order_id'`)
    assert.equal(items.length, p.summary.items.count)
    assert.equal(cents(items, 'subtotal'), p.summary.items.cents)
    assert.ok(items.filter((i) => i.menu_item_id).every((i) => i.category_name === 'Coffee'), 'category snapshot ran')
    assert.equal(items.find((i) => i.menu_item_name === 'Retired Special').menu_item_id, null)
    const payments = await all(db, 'select * from order_payments order by created_at')
    assert.equal(payments.length, p.rows.order_payments.length)
    assert.equal(payments.filter((x) => x.kind === 'refund').length, 1)
    const branchCharge = payments.find((x) => Number(x.amount) === 300)
    assert.equal(branchCharge.outlet_id, fx.OUTLET)
    assert.equal((await one(db, 'select count(*)::int n from order_revisions')).n, 1)
    const o2 = fx.buildSnapshot().orders[1]
    const o2Row = await one(db, 'select * from orders where id = $1', [lib.uuidV5(o2._id)])
    assert.equal(o2Row.customer_id, CUSTOMER)
    assert.equal(Number(o2Row.discount_total), 20)
    assert.equal(Number(o2Row.amount_paid), 180)

    // Product costs: Convex cost moved, platform cost kept, cost snapshots dated at the sale.
    const costs = await all(db, 'select menu_item_id, cost_price::float8 c from product_costs order by menu_item_id')
    assert.deepEqual(costs, [
      { menu_item_id: fx.MENU.latte, c: 42.25 },
      { menu_item_id: fx.MENU.burger, c: 61 },
    ].sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id)))
    const itemCosts = await all(db, `select c.unit_cost::float8 u, c.source, c.costed_at = o.created_at as at_sale, i.menu_item_name
      from order_item_costs c join order_items i on i.id = c.order_item_id join orders o on o.id = i.order_id order by i.menu_item_name`)
    assert.ok(itemCosts.length >= 3, 'lines of costed dishes got a cost snapshot')
    assert.ok(itemCosts.every((c) => c.at_sale && c.source === 'manual'))
    assert.ok(itemCosts.some((c) => c.menu_item_name === 'Latte' && c.u === 42.25))

    // Stock claims point at platform orders; the twin's at the platform copy.
    const [c1, , , c4, c5] = fx.buildSnapshot().orders
    assert.deepEqual((await all(db, 'select order_id from order_stock_applications')).map((r) => r.order_id), [lib.uuidV5(c1._id)])
    assert.deepEqual((await all(db, 'select order_id from simple_option_stock_applications')).map((r) => r.order_id), [lib.uuidV5(c4._id)])
    assert.deepEqual(
      (await all(db, 'select order_id from stock_movements order by order_id')).map((r) => r.order_id).sort(),
      [lib.uuidV5(c1._id), fx.OLD_PLATFORM_ORDERS[0].id].sort()
    )
    assert.equal(c5.clientOrderId, fx.OLD_PLATFORM_ORDERS[0].client_order_id)

    // Store Activity: one "order placed" per imported order, written by the trigger
    // (no restore setting stops it) → the sale the Convex capture already logged shows twice.
    const placed = await all(db, `select backend, external_order_id from store_activity where kind = 'order.placed' and tenant_id = $1 and backend = 'platform' and external_order_id = any($2::text[])`, [fx.TENANT_ID, imported.map((o) => o.id)])
    assert.equal(placed.length, imported.length)
    const o1Placed = await one(db, `select count(*)::int n from store_activity where kind = 'order.placed' and (external_order_id = $1 or external_order_id = $2)`, [c1._id, lib.uuidV5(c1._id)])
    assert.equal(o1Placed.n, 2, 'the duplicate activity row the owner sees')
    const flagged = await one(db, `select count(*)::int n from store_activity where 'after_hours' = any(flags)`)
    assert.equal(flagged.n, 0, 'app.store_activity_backfill keeps after-hours flags off history')

    // 3. Second run: nothing changes.
    const before = await stateOf(db)
    await db.exec(importSql)
    assert.equal(await stateOf(db), before, 'a re-run must be a no-op')

    // 4. Switch: now allowed; key kept.
    await db.exec(switchSql)
    const tenant = await one(db, 'select order_backend, convex_deployment_url from tenants where id = $1', [fx.TENANT_ID])
    assert.deepEqual(tenant, { order_backend: 'platform', convex_deployment_url: null })
    assert.equal((await one(db, 'select convex_deploy_key from tenant_secrets where tenant_id = $1', [fx.TENANT_ID])).convex_deploy_key, 'dev:fixture-key')
  } finally {
    await db.close()
  }

  // 5. A total that does not match rolls everything back (rekeys and costs included).
  const broken = importSql.replace(`v_cents <> ${p.summary.orders.cents} then`, `v_cents <> ${p.summary.orders.cents + 1} then`)
  assert.notEqual(broken, importSql)
  const db2 = await freshDb()
  try {
    const before = await stateOf(db2)
    await assert.rejects(db2.exec(broken), /convex import: orders/)
    assert.equal(await stateOf(db2), before, 'a failed check must leave nothing behind')

    // Without the replica-mode reset, the payments' amount_paid updates leave today's
    // updated_at on the orders (order_restore does not cover set_updated_at).
    const resetStep = /update public\.orders set updated_at = created_at\n\s+where tenant_id = v_tenant and id = any\(v_new_order_ids\) and updated_at is distinct from created_at;/
    assert.match(importSql, resetStep)
    const noReset = importSql.replace(resetStep, 'perform 1;')
    await assert.rejects(db2.exec(noReset), /carry today's updated_at/)
    assert.equal(await stateOf(db2), before)

    // 6. Loyalty switched on after the plan: refused at apply time, nothing written.
    await db2.exec(`update tenants set loyalty_enabled = true, loyalty_shadow = false where id = '${fx.TENANT_ID}'`)
    const withLoyalty = await stateOf(db2)
    await assert.rejects(db2.exec(importSql), /loyalty is live/)
    assert.equal(await stateOf(db2), withLoyalty)
  } finally {
    await db2.close()
  }
  console.log('Convex import: restore numbering, silent push, updated_at, totals, costs, rekeys, re-run no-op, rollback, loyalty refusal, guarded switch passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
