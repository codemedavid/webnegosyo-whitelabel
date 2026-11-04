/**
 * @jest-environment node
 *
 * Who may run the profit functions, and what they see, as the role that
 * really calls them (expense plan §6.3, §9): profit needs `reports` AND
 * `expenses` AND `costs`; a branch-locked account reads only its branch
 * (orders, ledger, expenses) and cannot read dish costs at sale; anon cannot
 * call them at all. Runs on PGlite through tests/sql/report-profit-worker.cjs
 * with the live RLS slice and the real expense-book migration.
 *
 * RLS refusals are silent, so every check asserts the figures a caller got.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const WORKER = path.join(process.cwd(), 'tests/sql/report-profit-worker.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const RENT = 'cccccccc-0000-4000-8000-000000000001'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  reports: '00000000-0000-4000-8000-000000000003',
  noCosts: '00000000-0000-4000-8000-000000000004',
  noExpenses: '00000000-0000-4000-8000-000000000005',
  noReports: '00000000-0000-4000-8000-000000000006',
  full: '00000000-0000-4000-8000-000000000007',
  branch: '00000000-0000-4000-8000-000000000008',
  ownerB: '00000000-0000-4000-8000-000000000009',
  superadmin: '00000000-0000-4000-8000-00000000000a',
}

const FROM = '2026-10-01T00:00:00+08:00'
const TO = '2026-10-02T00:00:00+08:00'
const NOON = '2026-10-01T12:00:00+08:00'

const orderRow = (id: string, outlet: string | null, total: number) => ({
  id,
  tenant_id: T_A,
  outlet_id: outlet,
  total,
  status: 'confirmed',
  payment_status: 'paid',
  created_at: NOON,
  source: 'pos',
  order_type: 'dine_in',
})

const ORDER_A1 = 'aaaaaaaa-1111-4000-8000-000000000001'
const LINE_A1 = 'aaaaaaaa-2222-4000-8000-000000000001'

const SEED = {
  tenants: [{ id: T_A, is_active: true }, { id: T_B, is_active: true }],
  outlets: [
    { id: OUT_A1, tenant_id: T_A },
    { id: OUT_A2, tenant_id: T_A },
  ],
  users: Object.values(U).map((id) => ({ id })),
  appUsers: [
    { user_id: U.owner, role: 'admin', tenant_id: T_A, is_owner: true, permissions: '{}', outlet_id: null },
    { user_id: U.legacy, role: 'admin', tenant_id: T_A, is_owner: false, permissions: null, outlet_id: null },
    { user_id: U.reports, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports}', outlet_id: null },
    { user_id: U.noCosts, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports,expenses}', outlet_id: null },
    { user_id: U.noExpenses, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports,costs}', outlet_id: null },
    { user_id: U.noReports, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{expenses,costs}', outlet_id: null },
    { user_id: U.full, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports,expenses,costs}', outlet_id: null },
    { user_id: U.branch, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports,expenses,costs}', outlet_id: OUT_A1 },
    { user_id: U.ownerB, role: 'admin', tenant_id: T_B, is_owner: true, permissions: '{}', outlet_id: null },
    { user_id: U.superadmin, role: 'superadmin', tenant_id: null, is_owner: false, permissions: null, outlet_id: null },
  ],
  orders: [
    orderRow(ORDER_A1, OUT_A1, 100),
    orderRow('aaaaaaaa-1111-4000-8000-000000000002', OUT_A2, 200),
    orderRow('aaaaaaaa-1111-4000-8000-000000000003', null, 400),
    { ...orderRow('bbbbbbbb-1111-4000-8000-000000000001', null, 800), tenant_id: T_B },
  ],
  items: [{ id: LINE_A1, order_id: ORDER_A1, menu_item_name: 'Sisig', quantity: 1, subtotal: 100 }],
  payments: [],
  // A1's order has no ledger sale, so its dish cost (₱40) is its fallback cost.
  dishCosts: [{ order_item_id: LINE_A1, tenant_id: T_A, unit_cost: '40.0000' }],
  movements: [
    { tenant_id: T_A, reason: 'sale', quantity_delta: '-1.0000', unit_cost: '10.0000', outlet_id: OUT_A1, created_at: NOON },
    { tenant_id: T_A, reason: 'sale', quantity_delta: '-1.0000', unit_cost: '20.0000', outlet_id: OUT_A2, created_at: NOON },
  ],
  payouts: [],
  expenseCategories: [{ id: RENT, tenant_id: T_A, system_key: 'rent', name: 'Rent (Upa)', grp: 'occupancy' }],
  expenses: [
    { tenant_id: T_A, outlet_id: OUT_A1, category_id: RENT, amount_cents: 100_000, spent_on: '2026-10-01', paid_from: 'bank', created_by_name: 'Owner' },
    { tenant_id: T_A, outlet_id: OUT_A2, category_id: RENT, amount_cents: 50_000, spent_on: '2026-10-01', paid_from: 'bank', created_by_name: 'Owner' },
    { tenant_id: T_A, outlet_id: null, category_id: RENT, amount_cents: 30_000, spent_on: '2026-10-01', paid_from: 'bank', created_by_name: 'Owner' },
  ].map((row, index) => ({ ...row, id: `eeeeeeee-0000-4000-8000-00000000000${index + 1}` })),
}

type As = { role: 'anon' | 'authenticated' | 'service_role'; uid: string | null }
type Call = { fn: string; args: Record<string, unknown>; as?: As }
type Result = { rows?: Array<Record<string, unknown>>; error?: { code: string; message: string } }

const staff = (uid: string): As => ({ role: 'authenticated', uid })
const summary = (as: As, extra: Record<string, unknown> = {}, tenant = T_A): Call => ({
  fn: 'report_profit_summary',
  args: { p_tenant: tenant, p_from: FROM, p_to: TO, ...extra },
  as,
})

function run(calls: Call[]): Result[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'report-profit-access-'))
  try {
    const file = path.join(dir, 'scenario.json')
    writeFileSync(file, JSON.stringify({ seed: SEED, calls }))
    const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), encoding: 'utf8' })
    return (JSON.parse(output) as { results: Result[] }).results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

interface Seen {
  net: number
  rent: number
  ledger: number
  fallback: number
  storeWide: number
  dishCosts: boolean
}

function outcome(result: Result): Seen | { refused: string } {
  if (result.error) return { refused: result.error.code }
  const [row] = result.rows ?? []
  return {
    net: Number(row?.net_sales_cents ?? 0),
    rent: Number(row?.occupancy_cents ?? 0),
    ledger: Number(row?.ledger_cogs_cents ?? 0),
    fallback: Number(row?.fallback_cogs_cents ?? 0),
    storeWide: Number(row?.store_wide_expense_cents ?? 0),
    dishCosts: row?.dish_costs_visible === true,
  }
}

const WHOLE: Seen = { net: 70_000, rent: 180_000, ledger: 3_000, fallback: 4_000, storeWide: 0, dishCosts: true }
const NOTHING: Seen = { net: 0, rent: 0, ledger: 0, fallback: 0, storeWide: 0, dishCosts: false }

const CASES: Array<[string, Call, ReturnType<typeof outcome>]> = [
  ['the owner sees the whole store', summary(staff(U.owner)), WHOLE],
  ['legacy full access (NULL permissions) sees the whole store', summary(staff(U.legacy)), WHOLE],
  ['reports + expenses + costs (store-wide staff) sees the whole store', summary(staff(U.full)), WHOLE],
  ['reports alone is refused', summary(staff(U.reports)), { refused: '42501' }],
  ['without costs is refused', summary(staff(U.noCosts)), { refused: '42501' }],
  ['without expenses is refused', summary(staff(U.noExpenses)), { refused: '42501' }],
  ['without reports is refused', summary(staff(U.noReports)), { refused: '42501' }],
  ['another store’s owner is refused', summary(staff(U.ownerB)), { refused: '42501' }],
  [
    'a branch-locked account sees only its branch, and no dish costs at sale',
    summary(staff(U.branch)),
    { net: 10_000, rent: 100_000, ledger: 1_000, fallback: 0, storeWide: 0, dishCosts: false },
  ],
  ['a branch-locked account asking for another branch gets nothing', summary(staff(U.branch), { p_outlet: OUT_A2 }), NOTHING],
  ['a branch-locked account asking for unassigned gets nothing', summary(staff(U.branch), { p_unassigned: true }), NOTHING],
  [
    'the owner on one branch: that branch, with store-wide costs beside it',
    summary(staff(U.owner), { p_outlet: OUT_A2 }),
    { net: 20_000, rent: 50_000, ledger: 2_000, fallback: 0, storeWide: 30_000, dishCosts: true },
  ],
  [
    'the owner on unassigned: orders without a branch and store-wide expenses',
    summary(staff(U.owner), { p_unassigned: true }),
    { net: 40_000, rent: 30_000, ledger: 0, fallback: 0, storeWide: 0, dishCosts: true },
  ],
  // The expense book's RLS reaches through app_user_may_reach_branch, which has
  // no superadmin arm (unlike stock_movements): support sees sales, not costs.
  [
    'a superadmin reads sales and the ledger, but no expenses or dish costs (their RLS)',
    summary(staff(U.superadmin)),
    { ...WHOLE, rent: 0, fallback: 0, dishCosts: false },
  ],
  ['the service role reads everything', summary({ role: 'service_role', uid: null }), WHOLE],
  ['anon cannot call it', summary({ role: 'anon', uid: null }), { refused: '42501' }],
  ['more than 93 days is refused', summary(staff(U.owner), { p_from: '2026-06-01T00:00:00+08:00' }), { refused: '22023' }],
  [
    'an hour grain is refused',
    { fn: 'report_profit_by_period', args: { p_tenant: T_A, p_from: FROM, p_to: TO, p_grain: 'hour' }, as: staff(U.owner) },
    { refused: '22023' },
  ],
]

describe('profit report functions — who may call them, and what they see', () => {
  let results: Result[] = []
  beforeAll(() => {
    results = run(CASES.map(([, call]) => call))
  }, 120_000)

  test.each(CASES.map(([name, , want], index) => [name, index, want] as const))('%s', (_name, index, want) => {
    expect(outcome(results[index])).toEqual(want)
  })

  test('every profit function refuses an account without costs, and anon', () => {
    const fns = [
      ['report_profit_summary', {}],
      ['report_profit_by_period', { p_grain: 'day' }],
      ['report_expenses_by_category', {}],
    ] as const
    const calls = fns.flatMap(([fn, extra]) =>
      [staff(U.noCosts), { role: 'anon', uid: null } as As].map((as) => ({ fn, args: { p_tenant: T_A, p_from: FROM, p_to: TO, ...extra }, as })),
    )
    expect(run(calls).map((result) => result.error?.code)).toEqual(calls.map(() => '42501'))
  })

  test('a branch-locked account’s categories hold only its branch’s spending', () => {
    const [own, other] = run([
      { fn: 'report_expenses_by_category', args: { p_tenant: T_A, p_from: FROM, p_to: TO }, as: staff(U.branch) },
      { fn: 'report_expenses_by_category', args: { p_tenant: T_A, p_from: FROM, p_to: TO, p_outlet: OUT_A2 }, as: staff(U.branch) },
    ])
    expect(own.rows?.map((row) => Number(row.cents))).toEqual([100_000])
    expect(other.rows).toEqual([])
  })
})
