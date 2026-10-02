// Standalone, isolated PostgreSQL regression for the reward ladder
// (`20261002120000_loyalty_reward_ladder.sql`). Requires @electric-sql/pglite
// (it may be installed outside this repository and supplied via NODE_PATH).
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const TENANT = '00000000-0000-0000-0000-00000000000a'
const PROGRAM = '00000000-0000-0000-0000-0000000000b1'
const VERSION = '00000000-0000-0000-0000-0000000000c1'
const MILESTONES = JSON.stringify([
  { at: 3, terms: { reward: { type: 'free_item', itemName: 'Iced Tea' }, milestoneAt: 3 } },
  { at: 6, terms: { reward: { type: 'fixed', amount: 20 }, milestoneAt: 6 } },
])

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create table loyalty_programs (id uuid primary key, tenant_id uuid not null);
      create table loyalty_ledger (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
        version_id uuid, customer_key text, kind text, delta numeric,
        order_backend text, external_order_id text, is_shadow boolean, actor uuid, note text, request_id text
      );
      create unique index loyalty_ledger_order_uq on loyalty_ledger
        (program_id, order_backend, external_order_id, kind) where external_order_id is not null;
      create table loyalty_balances (
        tenant_id uuid, program_id uuid, customer_key text, customer_id uuid,
        balance numeric default 0, lifetime_earned numeric default 0,
        rewards_issued integer default 0, cycle integer not null default 0, updated_at timestamptz,
        unique(program_id, customer_key)
      );
      create table loyalty_entitlements (
        id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
        version_id uuid, customer_key text, source_ledger_id uuid, terms jsonb,
        expires_at timestamptz, status text default 'issued', updated_at timestamptz,
        threshold_spent numeric check (threshold_spent >= 0), milestone_at numeric, cycle integer,
        created_at timestamptz default clock_timestamp()
      );
      create table loyalty_reservations (
        id uuid primary key default gen_random_uuid(), tenant_id uuid,
        entitlement_id uuid, status text default 'held', updated_at timestamptz
      );
      alter table loyalty_entitlements add column consumed_order_backend text, add column consumed_order_id text;
      create table loyalty_pos_settlements (id uuid primary key, tenant_id uuid, reservation_id uuid);
      create table loyalty_refund_restorations (settlement_id uuid primary key, entitlement_id uuid, disposition text);
      insert into loyalty_programs values ('${PROGRAM}', '${TENANT}');
    `)
    const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261002120000_loyalty_reward_ladder.sql'), 'utf8')
    // `--baseline` loads the pre-ladder refund restoration and MUST fail scenario 9.
    const restoreSql = process.argv.includes('--baseline')
      ? readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260914171000_loyalty_refund_restoration.sql'), 'utf8')
      : sql
    await db.exec(sql.match(/create function public\.apply_loyalty_earning\([\s\S]*?\n\$\$;/)[0])
    await db.exec(restoreSql.match(/create or replace function public\.restore_loyalty_refunded_receipt\([\s\S]*?\nend \$\$;/)[0])

    const apply = async (customer, kind, delta, order, milestones = MILESTONES) => {
      const { rows } = await db.query(
        `select public.apply_loyalty_earning($1,$2,$3,$4,null,$5,$6,'platform_supabase',$7,10,
           '{"reward":{"type":"free_item","itemName":"Meal"}}'::jsonb,null,false,null,null,null,$8::jsonb) as r`,
        [TENANT, PROGRAM, VERSION, customer, kind, delta, order, milestones],
      )
      return rows[0].r
    }
    const live = async (customer) => (await db.query(
      `select coalesce(milestone_at, 0)::int as at, cycle, status from loyalty_entitlements
        where customer_key = $1 order by created_at`, [customer])).rows
    const card = async (customer) => (await db.query(
      `select balance::int as balance, cycle from loyalty_balances where customer_key = $1`, [customer])).rows[0]

    // 1. Walking up one card issues each rung once, then the top resets it.
    for (let visit = 1; visit <= 10; visit++) await apply('walk', 'earn', 1, `walk-${visit}`)
    assert.deepEqual((await live('walk')).map((r) => [r.at, r.cycle]), [[3, 0], [6, 0], [0, 0]])
    assert.deepEqual(await card('walk'), { balance: 0, cycle: 1 })
    // ...and the second card earns its rungs again.
    for (let visit = 11; visit <= 13; visit++) await apply('walk', 'earn', 1, `walk-${visit}`)
    assert.deepEqual((await live('walk')).map((r) => [r.at, r.cycle]), [[3, 0], [6, 0], [0, 0], [3, 1]])

    // 2. A big points-style jump crosses every rung across two cards.
    const jump = await apply('jump', 'earn', 23, 'jump-1')
    assert.equal(jump.entitlementsIssued, 7)
    assert.deepEqual(await card('jump'), { balance: 3, cycle: 2 })
    assert.deepEqual((await live('jump')).map((r) => [r.at, r.cycle]), [[3, 0], [6, 0], [0, 0], [3, 1], [6, 1], [0, 1], [3, 2]])

    // 3. Reversing the visit that crossed a rung voids it and the next visit re-earns it.
    for (let visit = 1; visit <= 3; visit++) await apply('rev', 'earn', 1, `rev-${visit}`)
    await apply('rev', 'reverse', 0, 'rev-3')
    assert.deepEqual(await card('rev'), { balance: 2, cycle: 0 })
    await apply('rev', 'earn', 1, 'rev-4')
    assert.deepEqual((await live('rev')).map((r) => [r.at, r.status]), [[3, 'voided'], [3, 'issued']])

    // 4. A rung already USED is not issued twice when its visit is cancelled.
    for (let visit = 1; visit <= 3; visit++) await apply('used', 'earn', 1, `used-${visit}`)
    await db.exec(`update loyalty_entitlements set status = 'consumed' where customer_key = 'used'`)
    await apply('used', 'reverse', 0, 'used-3')
    await apply('used', 'earn', 1, 'used-4')
    assert.deepEqual((await live('used')).map((r) => [r.at, r.status]), [[3, 'consumed']])

    // 5. A merchant voiding a rung by hand does not see it re-minted next visit.
    for (let visit = 1; visit <= 3; visit++) await apply('hand', 'earn', 1, `hand-${visit}`)
    await db.exec(`update loyalty_entitlements set status = 'voided' where customer_key = 'hand'`)
    await apply('hand', 'earn', 1, 'hand-4')
    assert.deepEqual((await live('hand')).map((r) => [r.at, r.status]), [[3, 'voided']])

    // 6. Reversing the visit that completed a card rewinds the cycle: rungs held
    //    on that card are not issued again when the customer refills it.
    for (let visit = 1; visit <= 10; visit++) await apply('top', 'earn', 1, `top-${visit}`)
    await apply('top', 'reverse', 0, 'top-10')
    assert.deepEqual(await card('top'), { balance: 9, cycle: 0 })
    await apply('top', 'earn', 1, 'top-11')
    assert.deepEqual((await live('top')).map((r) => [r.at, r.status]), [[3, 'issued'], [6, 'issued'], [0, 'voided'], [0, 'issued']])
    assert.deepEqual(await card('top'), { balance: 0, cycle: 1 })

    // 7. A card without rungs behaves exactly as before.
    for (let visit = 1; visit <= 10; visit++) await apply('flat', 'earn', 1, `flat-${visit}`, null)
    assert.deepEqual((await live('flat')).map((r) => r.at), [0])

    // 8. A negative correction never mints anything; replays stay no-ops.
    assert.equal((await apply('walk', 'earn', 1, 'walk-13')).reason, 'duplicate')
    const corrected = await apply('rev', 'correction', -2, null)
    assert.equal(corrected.entitlementsIssued, 0)

    // 9. A refunded receipt whose source purchase was ALSO reversed returns the
    //    top reward's stamps and rewinds the card, so the next card's mid-card
    //    stamp-3 reward the customer already earned on it counts once — not
    //    again under a drifted card number.
    for (let visit = 1; visit <= 10; visit++) await apply('refund', 'earn', 1, `refund-${visit}`)
    const top = (await db.query(`select id from loyalty_entitlements where customer_key = 'refund' and milestone_at is null`)).rows[0].id
    const settlement = '00000000-0000-0000-0000-0000000000d1'
    await db.query(`insert into loyalty_reservations (id, tenant_id, entitlement_id) values ($1, $2, $3)`, ['00000000-0000-0000-0000-0000000000e1', TENANT, top])
    await db.query(`insert into loyalty_pos_settlements values ($1, $2, $3)`, [settlement, TENANT, '00000000-0000-0000-0000-0000000000e1'])
    await db.query(`update loyalty_entitlements set status = 'consumed', consumed_order_backend = 'platform_supabase', consumed_order_id = $1 where id = $2`, [settlement, top])
    for (let visit = 11; visit <= 14; visit++) await apply('refund', 'earn', 1, `refund-${visit}`)
    await apply('refund', 'reverse', 0, 'refund-10')
    assert.equal((await db.query(`select public.restore_loyalty_refunded_receipt($1, $2) as ok`, [TENANT, settlement])).rows[0].ok, true)
    assert.deepEqual(await card('refund'), { balance: 13, cycle: 0 })
    await apply('refund', 'earn', 1, 'refund-15')
    await apply('refund', 'earn', 1, 'refund-16')
    const refunded = (await live('refund')).filter((r) => r.status !== 'voided').map((r) => [r.at, r.cycle])
    assert.deepEqual(refunded, [[3, 0], [6, 0], [3, 1], [0, 0]])
    assert.deepEqual(await card('refund'), { balance: 5, cycle: 1 })

    console.log('Loyalty reward ladder SQL regressions passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
