/**
 * End-to-end loyalty regression: the REAL engine against a REAL Postgres.
 *
 * Everything between "an order changed" and "the balance moved" runs for real —
 * `parseLoyaltyRules`, `qualifyOrderForProgram`, `planEarning`,
 * `earnLoyaltyForFact`, and `apply_loyalty_earning` itself, executed by
 * PGlite from the migration files. Only the supabase-js transport is replaced,
 * and the replacement passes the same arguments `store.ts` passes, in the same
 * order.
 *
 * The unit suites pin each piece; this pins the seam between them, which is
 * where a stamp actually goes missing. Run with:
 *   NODE_PATH=<pglite> npx ts-node -P scripts/tsconfig.json \
 *     -r ./scripts/register-paths.js tests/sql/loyalty-e2e.ts
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
// PGlite is a manual-harness dependency supplied via NODE_PATH, exactly as the
// sibling `run-loyalty-*.cjs` harnesses expect, so it is not in package.json
// and has no types here. Only the two calls this file makes are described.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PGlite } = require('@electric-sql/pglite') as { PGlite: new () => PGliteDb }

interface PGliteDb {
  exec(sql: string): Promise<unknown>
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  close(): Promise<void>
}
import type { CustomerOrderFact } from '@/lib/customer-order-facts'
import { earnLoyaltyForFact, type LoyaltyEarningDeps } from '@/lib/loyalty/apply'
import { parseLoyaltyRules } from '@/lib/loyalty/rules'
import { applyLoyaltyReward, valueLoyaltyReward } from '@/lib/loyalty/reward'
import type { LoyaltyProgram } from '@/lib/loyalty/types'

const ROOT = path.resolve(__dirname, '../..')
const TENANT = '11111111-1111-1111-1111-111111111111'
const PROGRAM_STAMP = '22222222-2222-2222-2222-222222222222'
const PROGRAM_POINTS = '33333333-3333-3333-3333-333333333333'
const VERSION_STAMP = '44444444-4444-4444-4444-444444444444'
const VERSION_POINTS = '55555555-5555-5555-5555-555555555555'
const BRANCH_X = '66666666-6666-6666-6666-666666666666'
const BRANCH_Y = '77777777-7777-7777-7777-777777777777'
const PHONE = '+639171234567'
const CUSTOMER_KEY = `phone:${PHONE}`

interface VersionRow { id: string; program_id: string; version: number; rules: unknown; created_at: string }
interface EarnRow { program_id: string; version_id: string; customer_key: string; delta: string; is_shadow: boolean }
interface BalanceRow { program_id: string; balance: string; rewards_issued: number; lifetime_earned: string }
interface EntitlementRow { program_id: string; status: string; expires_at: string | null; threshold_spent: string; terms: Record<string, unknown> }

let checks = 0
const failures: string[] = []

/** Stable regardless of key order — Postgres jsonb does not preserve it. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  )
}

function check(label: string, actual: unknown, expected: unknown): void {
  checks += 1
  const a = canonical(actual)
  const e = canonical(expected)
  if (a !== e) failures.push(`${label}\n    expected ${e}\n    actual   ${a}`)
}

// --- schema ------------------------------------------------------------------
// Mirrors the shape `20260905140000_loyalty_programs` creates, reduced to the
// tables the function touches (the real migration also references tenants,
// outlets and auth.users, which have no bearing on earning arithmetic).
const SCHEMA = `
  create table loyalty_programs (id uuid primary key, tenant_id uuid not null);
  create table loyalty_program_versions (id uuid primary key, program_id uuid, version integer, rules jsonb, created_at timestamptz default now());
  create table loyalty_ledger (
    id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
    version_id uuid, customer_key text, kind text, delta numeric,
    order_backend text, external_order_id text, is_shadow boolean, actor uuid, note text,
    created_at timestamptz default now()
  );
  create unique index loyalty_ledger_order_uq on loyalty_ledger
    (program_id, order_backend, external_order_id, kind) where external_order_id is not null;
  create table loyalty_balances (
    tenant_id uuid, program_id uuid, customer_key text, customer_id uuid,
    balance numeric default 0, lifetime_earned numeric default 0,
    rewards_issued integer default 0, updated_at timestamptz,
    unique(program_id, customer_key)
  );
  create table loyalty_entitlements (
    id uuid primary key default gen_random_uuid(), tenant_id uuid, program_id uuid,
    version_id uuid, customer_key text, source_ledger_id uuid, terms jsonb,
    expires_at timestamptz, status text default 'issued', updated_at timestamptz
  );
  create table loyalty_reservations (
    id uuid primary key default gen_random_uuid(), tenant_id uuid,
    entitlement_id uuid, status text default 'held', updated_at timestamptz
  );
`

const STAMP_RULES = {
  earnMode: 'stamp',
  threshold: 3,
  minSpend: 150,
  reward: { type: 'fixed', amount: 100 },
  rewardExpiryDays: 30,
}

const POINTS_RULES = {
  earnMode: 'points',
  threshold: 500,
  pointsPerPeso: 1,
  reward: { type: 'percent', percent: 10, maxAmount: 50 },
  isExclusive: false,
}

// --- fixtures ----------------------------------------------------------------
function orderFact(overrides: Partial<CustomerOrderFact> & { externalOrderId: string }): CustomerOrderFact {
  return {
    backend: 'convex',
    customerId: null,
    phoneE164: PHONE,
    source: 'online',
    status: 'delivered',
    paymentStatus: 'paid',
    branchId: BRANCH_X,
    netTotal: 200,
    orderedAt: '2026-09-01T00:00:00.000Z',
    completedAt: '2026-09-01T01:00:00.000Z',
    updatedAt: '2026-09-01T01:00:00.000Z',
    items: [],
    ...overrides,
  }
}

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await db.exec(SCHEMA)

    // The function under test is the shipped one: the original definition,
    // then the reversal-accounting migration applied over it, exactly as a
    // deployed database would have them.
    const base = readFileSync(path.join(ROOT, 'supabase/migrations/20260905140000_loyalty_programs.sql'), 'utf8')
    await db.exec(base.match(/create or replace function public\.apply_loyalty_earning\([\s\S]*?\n\$\$;/)![0])
    // `--baseline` stops before the reversal fix, reproducing the behaviour a
    // database still on `…140000` has today. It must FAIL.
    if (!process.argv.includes('--baseline')) {
      await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations/20260906150000_loyalty_reversal_accounting.sql'), 'utf8'))
    } else {
      await db.exec('alter table loyalty_entitlements add column threshold_spent numeric')
    }

    await db.exec(`
      insert into loyalty_programs values ('${PROGRAM_STAMP}', '${TENANT}'), ('${PROGRAM_POINTS}', '${TENANT}');
      insert into loyalty_program_versions (id, program_id, version, rules) values
        ('${VERSION_STAMP}', '${PROGRAM_STAMP}', 1, '${JSON.stringify(STAMP_RULES)}'),
        ('${VERSION_POINTS}', '${PROGRAM_POINTS}', 1, '${JSON.stringify(POINTS_RULES)}');
    `)

    // --- programs, loaded and validated the way store.ts loads them ---------
    const versionRows = await db.query<{ id: string; program_id: string; version: number; rules: unknown; created_at: string }>(
      'select id, program_id, version, rules, created_at from loyalty_program_versions order by id',
    )
    const programs: LoyaltyProgram[] = versionRows.rows.map((row: VersionRow) => {
      const parsed = parseLoyaltyRules(row.rules)
      if (!parsed.ok) throw new Error(`fixture rules rejected: ${parsed.error}`)
      const isStamp = row.program_id === PROGRAM_STAMP
      return {
        id: row.program_id,
        tenantId: TENANT,
        name: isStamp ? 'Coffee Card' : 'Points Club',
        scope: isStamp ? 'business' : 'branch',
        outletId: isStamp ? null : BRANCH_X,
        status: 'active',
        activatesAt: '2026-08-01T00:00:00.000Z',
        endsAt: null,
        version: { id: row.id, version: row.version, rules: parsed.value, createdAt: row.created_at },
      }
    })

    const stampProgram = programs.find((p) => p.id === PROGRAM_STAMP)!
    check('stamp rules default to exclusive', stampProgram.version.rules.isExclusive, true)
    check('points rules keep opt-out exclusivity', programs.find((p) => p.id === PROGRAM_POINTS)!.version.rules.isExclusive, false)

    // --- ports, mapped exactly as store.ts maps them ------------------------
    const deps: LoyaltyEarningDeps = {
      loadActivePrograms: async () => programs,

      loadOrderEarns: async (tenantId, orderBackend, externalOrderId) => {
        const { rows } = await db.query<{ program_id: string; version_id: string; customer_key: string; delta: string; is_shadow: boolean }>(
          `select program_id, version_id, customer_key, delta, is_shadow from loyalty_ledger
            where tenant_id = $1 and order_backend = $2 and external_order_id = $3 and kind = 'earn'`,
          [tenantId, orderBackend, externalOrderId],
        )
        return rows.map((r: EarnRow) => ({
          programId: r.program_id,
          versionId: r.version_id,
          customerKey: r.customer_key,
          delta: Number(r.delta),
          isShadow: r.is_shadow,
        }))
      },

      applyLedgerEntry: async (entry) => {
        const { rows } = await db.query<{ result: Record<string, unknown> }>(
          `select public.apply_loyalty_earning(
             $1::uuid, $2::uuid, $3::uuid, $4::text, $5::uuid, $6::text, $7::numeric,
             $8::text, $9::text, $10::numeric, $11::jsonb, $12::timestamptz, $13::boolean,
             $14::uuid, $15::text) as result`,
          [
            entry.tenantId, entry.programId, entry.versionId, entry.customerKey, entry.customerId,
            entry.kind, entry.delta, entry.orderBackend, entry.externalOrderId, entry.threshold,
            entry.rewardTerms ? JSON.stringify(entry.rewardTerms) : null,
            entry.rewardExpiresAt, entry.isShadow, entry.actor ?? null, entry.note ?? null,
          ],
        )
        const result = rows[0].result as { applied?: boolean; reason?: string; entitlementsIssued?: number; balance?: number }
        return {
          applied: result.applied === true,
          reason: result.reason,
          entitlementsIssued: result.entitlementsIssued,
          balance: result.balance,
        }
      },
    }

    const live = { tenantId: TENANT, isShadow: false }
    const earn = (fact: CustomerOrderFact, ctx = live) => earnLoyaltyForFact(fact, ctx, deps)

    async function balances(): Promise<Record<string, { balance: number; issued: number; lifetime: number }>> {
      const { rows } = await db.query<{ program_id: string; balance: string; rewards_issued: number; lifetime_earned: string }>(
        'select program_id, balance, rewards_issued, lifetime_earned from loyalty_balances where customer_key = $1',
        [CUSTOMER_KEY],
      )
      return Object.fromEntries(
        rows.map((r: BalanceRow) => [
          r.program_id === PROGRAM_STAMP ? 'stamp' : 'points',
          { balance: Number(r.balance), issued: r.rewards_issued, lifetime: Number(r.lifetime_earned) },
        ]),
      )
    }

    // --- 1. a qualifying visit earns on every eligible program --------------
    const visit1 = await earn(orderFact({ externalOrderId: 'o1' }))
    check('visit 1 earns', visit1.action, 'earned')
    check('visit 1 touches both programs', visit1.programs.map((p) => p.delta).sort((a, b) => a - b), [1, 200])
    check('visit 1 balances', await balances(), {
      stamp: { balance: 1, issued: 0, lifetime: 1 },
      points: { balance: 200, issued: 0, lifetime: 200 },
    })

    // --- 2. the same event replayed must move nothing -----------------------
    const replay = await earn(orderFact({ externalOrderId: 'o1' }))
    check('replay is refused as duplicate', replay.programs.every((p) => p.isDuplicate && !p.applied), true)
    check('replay leaves balances untouched', await balances(), {
      stamp: { balance: 1, issued: 0, lifetime: 1 },
      points: { balance: 200, issued: 0, lifetime: 200 },
    })

    // --- 3. qualification is per program, not per order ---------------------
    const visit2 = await earn(orderFact({ externalOrderId: 'o2', netTotal: 100 }))
    check('below min spend earns on the points program only', visit2.programs.map((p) => p.programId), [PROGRAM_POINTS])
    const visit3 = await earn(orderFact({ externalOrderId: 'o3', branchId: BRANCH_Y }))
    check('a branch program ignores another branch', visit3.programs.map((p) => p.programId), [PROGRAM_STAMP])
    check('after the selective visits', await balances(), {
      stamp: { balance: 2, issued: 0, lifetime: 2 },
      points: { balance: 300, issued: 0, lifetime: 300 },
    })

    // --- 4. orders that must never earn -------------------------------------
    check('anonymous order', (await earn(orderFact({ externalOrderId: 'x1', phoneE164: null }))).reason, 'anonymous')
    check('open ticket', (await earn(orderFact({ externalOrderId: 'x2', status: 'pending' }))).reason, 'not_qualified')
    check('unpaid POS sale', (await earn(orderFact({ externalOrderId: 'x3', source: 'pos', status: 'open', paymentStatus: 'unpaid' }))).reason, 'not_qualified')
    check('order completed before activation', (await earn(orderFact({ externalOrderId: 'x4', completedAt: '2026-07-01T00:00:00.000Z' }))).reason, 'not_qualified')
    check('nothing earned from refused orders', await balances(), {
      stamp: { balance: 2, issued: 0, lifetime: 2 },
      points: { balance: 300, issued: 0, lifetime: 300 },
    })

    // --- 5. a settled POS sale crosses both thresholds ----------------------
    const visit4 = await earn(orderFact({ externalOrderId: 'o4', source: 'pos', status: 'open', paymentStatus: 'paid' }))
    check('threshold crossing issues one reward per program', visit4.programs.map((p) => p.entitlementsIssued).sort(), [1, 1])
    check('crossing resets the card and banks the remainder', await balances(), {
      stamp: { balance: 0, issued: 1, lifetime: 3 },
      points: { balance: 0, issued: 1, lifetime: 500 },
    })

    const issued = await db.query<{ program_id: string; status: string; expires_at: string | null; threshold_spent: string; terms: Record<string, unknown> }>(
      'select program_id, status, expires_at, threshold_spent, terms from loyalty_entitlements order by program_id',
    )
    check('two rewards are claimable', issued.rows.map((r: EntitlementRow) => r.status), ['issued', 'issued'])
    const stampReward = issued.rows.find((r: EntitlementRow) => r.program_id === PROGRAM_STAMP)!
    check('reward expiry is stamped from the order, not from now',
      new Date(stampReward.expires_at!).toISOString(), '2026-10-01T01:00:00.000Z')
    check('the reward remembers what it cost', Number(stampReward.threshold_spent), 3)
    check('terms are frozen at issue time', stampReward.terms, {
      programId: PROGRAM_STAMP, programName: 'Coffee Card', versionNumber: 1,
      reward: { type: 'fixed', amount: 100 }, isExclusive: true,
    })

    // --- 6. the reward is worth what it says on a real cart -----------------
    const terms = stampReward.terms as unknown as Parameters<typeof valueLoyaltyReward>[0]
    const cart = { lines: [{ id: 'line-1', menuItemId: 'latte', quantity: 2, subtotal: 260 }] }
    const valuation = valueLoyaltyReward(terms, cart)
    check('a ₱100 reward on a ₱260 cart', valuation.ok && valuation.line.amount, 100)
    check('an exclusive reward refuses to share a sale with a voucher',
      valuation.ok
        ? applyLoyaltyReward({ discountLines: [{ label: 'SAVE50', amount: 50 }] }, valuation.line, terms.isExclusive)
        : null,
      { ok: false, reason: 'not_stackable' })

    // --- 7. cancelling reverses the visit AND returns the reward's cost -----
    const cancelled = await earn(orderFact({ externalOrderId: 'o4', status: 'cancelled' }))
    check('the cancelled order reverses both programs', cancelled.action, 'reversed')
    check('every reversal applied', cancelled.programs.every((p) => p.applied), true)
    // Stamp: 0 − 1 (the cancelled visit) + 3 (the voided reward's cost) = 2,
    // which is exactly the two visits that still stand.
    check('balances fall back to the visits that still stand', await balances(), {
      stamp: { balance: 2, issued: 1, lifetime: 3 },
      points: { balance: 300, issued: 1, lifetime: 500 },
    })
    const afterVoid = await db.query<{ status: string }>('select status from loyalty_entitlements')
    check('the unclaimed rewards are voided', afterVoid.rows.map((r: { status: string }) => r.status), ['voided', 'voided'])

    // --- 8. documented limit: un-cancelling does not re-earn ----------------
    const uncancelled = await earn(orderFact({ externalOrderId: 'o4', source: 'pos', status: 'open', paymentStatus: 'paid' }))
    check('an un-cancelled order does not stamp twice', uncancelled.programs.every((p) => p.isDuplicate), true)
    check('and its balances do not move', await balances(), {
      stamp: { balance: 2, issued: 1, lifetime: 3 },
      points: { balance: 300, issued: 1, lifetime: 500 },
    })

    // --- 9. shadow mode observes without paying -----------------------------
    const shadow = await earn(orderFact({ externalOrderId: 'o5' }), { tenantId: TENANT, isShadow: true })
    check('shadow earning is applied to the ledger', shadow.programs.every((p) => p.applied), true)
    check('shadow moves no balance', await balances(), {
      stamp: { balance: 2, issued: 1, lifetime: 3 },
      points: { balance: 300, issued: 1, lifetime: 500 },
    })
    const shadowRows = await db.query<{ n: number }>(
      "select count(*)::int as n from loyalty_ledger where external_order_id = 'o5' and is_shadow",
    )
    check('shadow rows are recorded for reconciliation', shadowRows.rows[0].n, 2)

    // --- 10. cross-tenant program access is refused -------------------------
    let crossTenant = 'no error'
    try {
      await deps.applyLedgerEntry({
        tenantId: '99999999-9999-9999-9999-999999999999', programId: PROGRAM_STAMP,
        versionId: VERSION_STAMP, customerKey: CUSTOMER_KEY, customerId: null, kind: 'earn',
        delta: 99, orderBackend: 'convex', externalOrderId: 'evil', threshold: 3,
        rewardTerms: null, rewardExpiresAt: null, isShadow: false,
      })
    } catch (error) {
      crossTenant = (error as Error).message.includes('does not belong to tenant') ? 'refused' : (error as Error).message
    }
    check('a program cannot be moved by another tenant', crossTenant, 'refused')
  } finally {
    await db.close()
  }

  if (failures.length > 0) {
    console.error(`\nLoyalty E2E: ${failures.length} of ${checks} checks FAILED\n`)
    for (const failure of failures) console.error(`  ✗ ${failure}\n`)
    process.exitCode = 1
    return
  }
  console.log(`Loyalty end-to-end passed (${checks} checks)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
