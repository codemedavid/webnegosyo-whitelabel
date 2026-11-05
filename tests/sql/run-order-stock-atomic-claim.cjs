// apply_order_stock_claim: an order's stock claim and its ledger rows commit
// together (20261103140000_order_stock_atomic_claim.sql).
//
// Loads the REAL claim-table migrations (20260805120000, 20260806130000,
// 20261013160000) and the migration under test over a slice of the platform
// schema. `apply_stock_movement` is the LIVE body (probed 2026-11-03), with
// `stock_movement_frozen_cost` stubbed (frozen cost is not under test here).
//   node tests/sql/run-order-stock-atomic-claim.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const FLOUR = '33333333-3333-4333-8333-333333333333'
const SUGAR = '44444444-4444-4444-8444-444444444444'
const FOREIGN_ITEM = '55555555-5555-4555-8555-555555555555'
const GRAM = '66666666-6666-4666-8666-666666666666'
const NORTH = '77777777-7777-4777-8777-777777777777'

async function installSchema(db) {
  await installPlatformAuth(db)
  await db.exec(`
    create table public.tenants (id uuid primary key);
    create table public.app_users (user_id uuid, tenant_id uuid, role text);
    create table public.outlets (id uuid primary key, tenant_id uuid not null);
    create table public.inventory_units (id uuid primary key, tenant_id uuid, dimension text);
    create table public.inventory_items (
      id uuid primary key, tenant_id uuid not null, name text, stock_unit_id uuid,
      current_qty numeric(16,4) not null default 0, unit_cost numeric
    );
    create table public.inventory_stock (
      tenant_id uuid not null, inventory_item_id uuid not null, outlet_id uuid,
      current_qty numeric(16,4) not null default 0, updated_at timestamptz,
      unique nulls not distinct (tenant_id, inventory_item_id, outlet_id)
    );
    create table public.recipe_components (id uuid primary key, recipe_id uuid, inventory_item_id uuid, unit_id uuid, quantity numeric);
    create table public.inventory_audit_log (tenant_id uuid, order_id text, revision integer, event text);
    create table public.stock_movements (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id),
      inventory_item_id uuid not null,
      reason text not null,
      quantity_delta numeric not null,
      entered_quantity numeric,
      entered_unit_id uuid,
      balance_after numeric,
      unit_cost numeric,
      note text,
      order_id text,
      created_by uuid,
      created_at timestamptz not null default now(),
      outlet_id uuid,
      target_qty numeric,
      stock_transfer_id uuid,
      inventory_count_id uuid,
      client_request_id uuid,
      constraint stock_movements_inventory_item_id_fkey foreign key (inventory_item_id) references public.inventory_items(id)
    );
    create function public.stock_movement_frozen_cost(uuid, uuid, text, uuid, text, uuid)
      returns numeric language sql as $$ select null::numeric $$;
  `)
  // LIVE body of public.apply_stock_movement (2026-11-03), verbatim.
  await db.exec(`
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  branch_qty numeric(16,4);
  rollup_qty numeric(16,4);
  counted_against numeric(16,4);
  v_item_cost numeric;
  v_new_item_cost numeric;
begin
  if new.outlet_id is not null and not exists (
    select 1 from outlets o where o.id = new.outlet_id and o.tenant_id = new.tenant_id
  ) then
    raise exception 'Stock movement references a branch outside its tenant';
  end if;

  select current_qty, unit_cost into rollup_qty, v_item_cost
    from inventory_items
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
     for update;

  if rollup_qty is null then
    raise exception 'Stock movement references an inventory item outside its tenant';
  end if;

  if new.reason = 'stocktake' and new.target_qty is not null then
    select current_qty into counted_against
      from inventory_stock
     where tenant_id = new.tenant_id
       and inventory_item_id = new.inventory_item_id
       and outlet_id is not distinct from new.outlet_id
       for update;

    new.quantity_delta := new.target_qty - coalesce(counted_against, 0);
  end if;

  if new.reason = 'receive' then
    if new.unit_cost is not null and new.quantity_delta > 0 then
      v_new_item_cost := case
        when rollup_qty <= 0 or v_item_cost <= 0 then new.unit_cost
        else (rollup_qty * v_item_cost + new.quantity_delta * new.unit_cost) / (rollup_qty + new.quantity_delta)
      end;
    end if;
  else
    new.unit_cost := public.stock_movement_frozen_cost(
      new.tenant_id,
      new.inventory_item_id,
      new.reason,
      new.outlet_id,
      new.order_id,
      new.stock_transfer_id
    );
  end if;

  update inventory_items
     set current_qty = current_qty + new.quantity_delta,
         unit_cost = coalesce(v_new_item_cost, unit_cost)
   where id = new.inventory_item_id
     and tenant_id = new.tenant_id
  returning current_qty into rollup_qty;

  update inventory_stock
     set current_qty = current_qty + new.quantity_delta,
         updated_at = now()
   where tenant_id = new.tenant_id
     and inventory_item_id = new.inventory_item_id
     and outlet_id is not distinct from new.outlet_id
  returning current_qty into branch_qty;

  if branch_qty is null then
    begin
      insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty)
      values (new.tenant_id, new.inventory_item_id, new.outlet_id, new.quantity_delta)
      returning current_qty into branch_qty;
    exception when unique_violation then
      update inventory_stock
         set current_qty = current_qty + new.quantity_delta,
             updated_at = now()
       where tenant_id = new.tenant_id
         and inventory_item_id = new.inventory_item_id
         and outlet_id is not distinct from new.outlet_id
      returning current_qty into branch_qty;
    end;
  end if;

  new.balance_after := branch_qty;
  return new;
end;
$function$;
create trigger stock_movements_apply before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();
  `)
  for (const name of [
    '20260805120000_order_stock_applications.sql',
    '20260806130000_order_stock_application_revision.sql',
    '20261013160000_order_stock_claim_kinds.sql',
    '20261103140000_order_stock_atomic_claim.sql',
  ]) {
    await db.exec(readMigration(name))
  }
  await db.query('insert into tenants values ($1), ($2)', [TENANT, OTHER_TENANT])
  await db.query('insert into outlets values ($1, $2)', [NORTH, TENANT])
  await db.query("insert into inventory_units values ($1, $2, 'weight')", [GRAM, TENANT])
  await db.query(
    `insert into inventory_items (id, tenant_id, name, stock_unit_id, current_qty) values
       ($1, $3, 'Flour', $4, 1000), ($2, $3, 'Sugar', $4, 500), ($5, $6, 'Theirs', $4, 100)`,
    [FLOUR, SUGAR, TENANT, GRAM, FOREIGN_ITEM, OTHER_TENANT],
  )
}

const sale = (item, grams, outlet = null) => ({
  inventory_item_id: item, outlet_id: outlet, reason: 'sale',
  quantity_delta: -grams, entered_quantity: grams, entered_unit_id: GRAM,
})
const giveBack = (item, grams, outlet = null) => ({
  inventory_item_id: item, outlet_id: outlet, reason: 'void',
  quantity_delta: grams, entered_quantity: grams, entered_unit_id: GRAM,
})

function claimer(db) {
  return async (order, reason, kind, revision, movements = [], mode = 'rows') => {
    const { rows } = await db.query(
      'select public.apply_order_stock_claim($1, $2, $3, $4, $5, $6::jsonb, $7) as r',
      [TENANT, order, reason, kind, revision, JSON.stringify(movements), mode],
    )
    return rows[0].r
  }
}

async function qty(db, item) {
  const { rows } = await db.query('select current_qty::numeric as q from inventory_items where id = $1', [item])
  return Number(rows[0].q)
}
async function claims(db, order) {
  const { rows } = await db.query(
    'select reason, kind, revision, restored from order_stock_applications where order_id = $1 order by reason, kind, revision',
    [order],
  )
  return rows
}
async function movementCount(db, order) {
  const { rows } = await db.query('select count(*)::int as n from stock_movements where order_id = $1', [order])
  return rows[0].n
}

async function checkOnceAndDuplicate(db, apply) {
  const first = await apply('o1', 'sale', 'order', 0, [sale(FLOUR, 100), sale(SUGAR, 20)])
  assert.equal(first.status, 'applied')
  assert.equal(first.rows.length, 2, 'both written rows are returned')
  assert.equal(await qty(db, FLOUR), 900, 'one call deducts once')
  assert.equal(await qty(db, SUGAR), 480)
  assert.equal((await claims(db, 'o1')).length, 1, 'the claim committed with the rows')

  const again = await apply('o1', 'sale', 'order', 0, [sale(FLOUR, 100), sale(SUGAR, 20)])
  assert.equal(again.status, 'duplicate', 'a repeated call is a duplicate')
  assert.deepEqual(again.rows, [])
  assert.equal(await qty(db, FLOUR), 900, 'and deducts nothing')
  assert.equal(await movementCount(db, 'o1'), 2)
}

async function checkRollback(db, apply) {
  // The second row names another store's ingredient: the ledger trigger raises
  // after the claim and the first row were written. Nothing may survive.
  await assert.rejects(
    apply('o2', 'sale', 'order', 0, [sale(FLOUR, 50), sale(FOREIGN_ITEM, 5)]),
    /outside its tenant/,
  )
  assert.equal(await qty(db, FLOUR), 900, 'the first row rolled back')
  assert.equal((await claims(db, 'o2')).length, 0, 'the claim rolled back too')
  assert.equal(await movementCount(db, 'o2'), 0)

  const retry = await apply('o2', 'sale', 'order', 0, [sale(FLOUR, 50)])
  assert.equal(retry.status, 'applied', 'a failed call leaves the order retryable')
  assert.equal(await qty(db, FLOUR), 850)

  await assert.rejects(apply('o2b', 'sale', 'order', 0, [{ ...sale(FLOUR, 1), reason: 'receive' }]), /Invalid order stock movement/)
  await assert.rejects(apply('o2b', 'sale', 'order', 0, [{ ...sale(FLOUR, 1), quantity_delta: 0 }]), /Invalid order stock movement/)
  await assert.rejects(apply('o2b', 'refund', 'order', 0, []), /Invalid order stock claim/)
  await assert.rejects(apply('o2b', 'sale', 'order', 0, Array.from({ length: 501 }, () => sale(FLOUR, 1))), /Too many/)
  assert.equal((await claims(db, 'o2b')).length, 0, 'refused input claims nothing')
  assert.equal(await qty(db, FLOUR), 850)
}

async function checkCancelWins(db, apply) {
  const cancel = await apply('o3', 'void', 'order', 0, [], 'reverse_all')
  assert.equal(cancel.status, 'applied', 'a cancel with nothing recorded still claims')
  assert.equal((await claims(db, 'o3')).length, 1, 'and keeps its claim as the marker')
  const late = await apply('o3', 'sale', 'order', 0, [sale(FLOUR, 100)])
  assert.equal(late.status, 'cancelled_first', 'a sale after its cancellation stands down')
  assert.equal(await qty(db, FLOUR), 850)
  assert.equal((await claims(db, 'o3')).length, 1, 'without a claim of its own')
  const lateEdit = await apply('o3', 'sale', 'edit', 1, [sale(FLOUR, 100)])
  assert.equal(lateEdit.status, 'cancelled_first', 'an edit of a cancelled order stands down')
  const reopened = await apply('o3', 'sale', 'order', 1, [sale(FLOUR, 10)])
  assert.equal(reopened.status, 'applied', 'an un-cancel at a fresh revision spends')
  assert.equal(await qty(db, FLOUR), 840)
}

async function checkEditCap(db, apply) {
  await apply('o4', 'sale', 'order', 0, [sale(FLOUR, 100, NORTH)])
  assert.equal(await qty(db, FLOUR), 740)
  const forged = await apply('o4', 'void', 'edit', 5000, [giveBack(FLOUR, 9999, NORTH), giveBack(SUGAR, 9999)])
  assert.equal(forged.status, 'applied')
  assert.equal(forged.rows.length, 1, 'an ingredient the order never spent gives nothing back')
  assert.equal(forged.rows[0].quantity_delta, 100, 'a give-back is capped at what the order holds')
  assert.equal(forged.rows[0].entered_quantity, 100, 'entered quantity scales with the cap')
  assert.equal(await qty(db, FLOUR), 840)
  assert.equal(await qty(db, SUGAR), 480)
  const again = await apply('o4', 'void', 'edit', 5001, [giveBack(FLOUR, 9999, NORTH)])
  assert.equal(again.rows.length, 0, 'once returned in full, nothing more comes back')
  assert.equal(await qty(db, FLOUR), 840)
  const otherShelf = await apply('o4', 'void', 'edit', 5002, [giveBack(FLOUR, 50)])
  assert.equal(otherShelf.rows.length, 0, 'a give-back is capped per branch shelf')
  // An edit that spends and returns in one call: the return may use what the
  // same call just spent.
  const swap = await apply('o4', 'sale', 'edit', 6, [sale(FLOUR, 30, NORTH)])
  assert.equal(swap.status, 'applied')
  const back = await apply('o4', 'void', 'edit', 6, [giveBack(FLOUR, 20, NORTH), giveBack(FLOUR, 20, NORTH)])
  assert.deepEqual(back.rows.map((r) => r.quantity_delta), [20, 10], 'the cap is cumulative across rows')
  assert.equal(await qty(db, FLOUR), 840)
}

async function checkReverseAll(db, apply) {
  await apply('o5', 'sale', 'order', 0, [sale(FLOUR, 100), sale(FLOUR, 50, NORTH), sale(SUGAR, 10)])
  await apply('o5', 'void', 'edit', 1, [giveBack(SUGAR, 10)])
  assert.equal(await qty(db, FLOUR), 690)
  const reversed = await apply('o5', 'void', 'order', 0, [], 'reverse_all')
  assert.equal(reversed.status, 'applied')
  assert.equal(reversed.rows.length, 2, 'netted per ingredient + branch; sugar already came back')
  assert.equal(await qty(db, FLOUR), 840, 'everything the order still held came back')
  assert.equal(await qty(db, SUGAR), 480)
  const [voidClaim] = (await claims(db, 'o5')).filter((c) => c.kind === 'order' && c.reason === 'void')
  assert.equal(voidClaim.restored.length, 2, 'what came back is remembered on the claim')
  const twice = await apply('o5', 'void', 'order', 0, [], 'reverse_all')
  assert.equal(twice.status, 'duplicate', 'cancelling twice puts nothing back twice')
  assert.equal(await qty(db, FLOUR), 840)
  await assert.rejects(apply('o5', 'sale', 'order', 9, [], 'reverse_all'), /Only a cancellation/)
}

async function checkGrants(db) {
  for (const role of ['anon', 'authenticated']) {
    await as(db, role, null)
    await assert.rejects(
      db.query("select public.apply_order_stock_claim($1, 'x', 'sale', 'order', 0, '[]'::jsonb, 'rows')", [TENANT]),
      /permission denied/,
      `${role} may not claim order stock`,
    )
  }
  await as(db, 'service_role', null)
  const { rows } = await db.query(
    "select public.apply_order_stock_claim($1, 'svc', 'sale', 'order', 0, $2::jsonb, 'rows') as r",
    [TENANT, JSON.stringify([sale(FLOUR, 1)])],
  )
  assert.equal(rows[0].r.status, 'applied', 'the service role may')
  await reset(db)
  assert.equal(await qty(db, FLOUR), 839)
  const { rows: config } = await db.query(
    "select proconfig, prosecdef from pg_proc where proname = 'apply_order_stock_claim'",
  )
  assert.deepEqual(config[0].proconfig, ['search_path=""'], 'search_path is pinned')
  assert.equal(config[0].prosecdef, false, 'security invoker')
}

async function main() {
  const db = new PGlite()
  try {
    await installSchema(db)
    const apply = claimer(db)
    await checkOnceAndDuplicate(db, apply)
    await checkRollback(db, apply)
    await checkCancelWins(db, apply)
    await checkEditCap(db, apply)
    await checkReverseAll(db, apply)
    await checkGrants(db)
    console.log('PASS: order stock claim + ledger atomic (once, duplicate, rollback, cancel wins, edit cap, reverse, grants)')
  } finally {
    await db.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
