/**
 * @jest-environment node
 *
 * Who may run the sales report functions, and what they see (plan §8, §10.3),
 * as the role that really calls them: anon, store staff with and without the
 * `reports` key, a branch-locked manager, another store's owner, the service
 * role. Runs on PGlite through tests/sql/report-sales-worker.cjs, with the live
 * RLS slice — and again with HIGH-3 (20261013120200) applied, which ships with
 * the same deploy.
 *
 * RLS refusals are silent, so every check asserts the orders a caller got.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const WORKER = path.join(process.cwd(), 'tests/sql/report-sales-worker.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  analytics: '00000000-0000-4000-8000-000000000003',
  reports: '00000000-0000-4000-8000-000000000004',
  orders: '00000000-0000-4000-8000-000000000005',
  menu: '00000000-0000-4000-8000-000000000006',
  branch: '00000000-0000-4000-8000-000000000007',
  ownerB: '00000000-0000-4000-8000-000000000008',
  superadmin: '00000000-0000-4000-8000-000000000009',
}

const FROM = '2026-10-01T00:00:00+08:00'
const TO = '2026-10-02T00:00:00+08:00'

function orderRow(id: string, tenant: string, outlet: string | null, total: number) {
  return {
    id,
    tenant_id: tenant,
    outlet_id: outlet,
    total,
    status: 'confirmed',
    payment_status: 'paid',
    created_at: '2026-10-01T12:00:00+08:00',
    source: 'pos',
    order_type: 'dine_in',
  }
}

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
    { user_id: U.analytics, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{analytics}', outlet_id: null },
    { user_id: U.reports, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{reports}', outlet_id: null },
    { user_id: U.orders, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{orders,pos}', outlet_id: null },
    { user_id: U.menu, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{menu}', outlet_id: null },
    { user_id: U.branch, role: 'admin', tenant_id: T_A, is_owner: false, permissions: '{analytics}', outlet_id: OUT_A1 },
    { user_id: U.ownerB, role: 'admin', tenant_id: T_B, is_owner: true, permissions: '{}', outlet_id: null },
    { user_id: U.superadmin, role: 'superadmin', tenant_id: null, is_owner: false, permissions: null, outlet_id: null },
  ],
  orders: [
    orderRow('aaaaaaaa-1111-4000-8000-000000000001', T_A, OUT_A1, 100),
    orderRow('aaaaaaaa-1111-4000-8000-000000000002', T_A, OUT_A2, 200),
    orderRow('aaaaaaaa-1111-4000-8000-000000000003', T_A, null, 400),
    orderRow('bbbbbbbb-1111-4000-8000-000000000001', T_B, null, 800),
  ],
  items: [],
  payments: [],
}

type As = { role: 'anon' | 'authenticated' | 'service_role'; uid: string | null }
type Call = { fn: string; args: Record<string, unknown>; as?: As }
type Result = { rows?: Array<Record<string, unknown>>; error?: { code: string; message: string } }

const staff = (uid: string): As => ({ role: 'authenticated', uid })
const summary = (as: As, extra: Record<string, unknown> = {}, tenant = T_A): Call => ({
  fn: 'report_sales_summary',
  args: { p_tenant: tenant, p_from: FROM, p_to: TO, ...extra },
  as,
})

function run(calls: Call[], applyHigh3: boolean): Result[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'report-access-'))
  try {
    const file = path.join(dir, 'scenario.json')
    writeFileSync(file, JSON.stringify({ applyHigh3, seed: SEED, calls }))
    const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), encoding: 'utf8' })
    return (JSON.parse(output) as { results: Result[] }).results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Orders and net sales the call saw, or the SQLSTATE it was refused with. */
function outcome(result: Result): { orders: number; netCents: number } | { refused: string } {
  if (result.error) return { refused: result.error.code }
  const [row] = result.rows ?? []
  return { orders: Number(row?.orders ?? 0), netCents: Number(row?.net_cents ?? 0) }
}

const CASES: Array<[string, Call, ReturnType<typeof outcome>]> = [
  ['owner sees the whole store, branches and unassigned', summary(staff(U.owner)), { orders: 3, netCents: 70000 }],
  ['legacy full access (NULL permissions) sees the whole store', summary(staff(U.legacy)), { orders: 3, netCents: 70000 }],
  ['analytics implies reports', summary(staff(U.analytics)), { orders: 3, netCents: 70000 }],
  ['the reports key alone is enough', summary(staff(U.reports)), { orders: 3, netCents: 70000 }],
  ['orders + pos (the live queue) is not reports', summary(staff(U.orders)), { refused: '42501' }],
  ['menu-only staff are refused', summary(staff(U.menu)), { refused: '42501' }],
  ['another store’s owner is refused', summary(staff(U.ownerB)), { refused: '42501' }],
  ['a branch-locked manager sees only their branch (no unassigned)', summary(staff(U.branch)), { orders: 1, netCents: 10000 }],
  ['a branch-locked manager asking for another branch gets nothing', summary(staff(U.branch), { p_outlet: OUT_A2 }), { orders: 0, netCents: 0 }],
  ['a branch-locked manager asking for unassigned gets nothing', summary(staff(U.branch), { p_unassigned: true }), { orders: 0, netCents: 0 }],
  ['owner: one branch', summary(staff(U.owner), { p_outlet: OUT_A2 }), { orders: 1, netCents: 20000 }],
  ['owner: unassigned only', summary(staff(U.owner), { p_unassigned: true }), { orders: 1, netCents: 40000 }],
  ['superadmin may read a store', summary(staff(U.superadmin)), { orders: 3, netCents: 70000 }],
  ['service role (server jobs) may read a store', summary({ role: 'service_role', uid: null }), { orders: 3, netCents: 70000 }],
  ['anon cannot even call it', summary({ role: 'anon', uid: null }), { refused: '42501' }],
  ['a range of more than 93 days is refused', summary(staff(U.owner), { p_from: '2026-06-01T00:00:00+08:00' }), { refused: '22023' }],
  ['a backwards range is refused', summary(staff(U.owner), { p_from: TO, p_to: FROM }), { refused: '22023' }],
  ['a branch AND unassigned is refused', summary(staff(U.owner), { p_outlet: OUT_A1, p_unassigned: true }), { refused: '22023' }],
  [
    'an unknown grain is refused',
    { fn: 'report_sales_by_period', args: { p_tenant: T_A, p_from: FROM, p_to: TO, p_grain: 'year' }, as: staff(U.owner) },
    { refused: '22023' },
  ],
  [
    'an unsupported time zone is refused',
    { fn: 'report_sales_by_hour', args: { p_tenant: T_A, p_from: FROM, p_to: TO, p_tz: 'UTC' }, as: staff(U.owner) },
    { refused: '22023' },
  ],
  [
    'an unknown dimension is refused',
    { fn: 'report_sales_by_dimension', args: { p_tenant: T_A, p_from: FROM, p_to: TO, p_dimension: 'customer_contact' }, as: staff(U.owner) },
    { refused: '22023' },
  ],
]

describe.each([
  ['live policies today', false],
  ['with HIGH-3 (order reads need a key) applied', true],
])('report functions — %s', (_label, applyHigh3) => {
  let results: Result[] = []
  beforeAll(() => {
    results = run(
      CASES.map(([, call]) => call),
      applyHigh3,
    )
  }, 120_000)

  test.each(CASES.map(([name, , want], index) => [name, index, want] as const))('%s', (_name, index, want) => {
    const got = outcome(results[index])
    // Only "refused" checks the code; a refusal message is shown to staff.
    expect(got).toEqual(want)
  })

  test('every public function refuses an account without the reports key', () => {
    const fns = [
      ['report_sales_summary', {}],
      ['report_sales_by_period', { p_grain: 'day' }],
      ['report_sales_by_dimension', { p_dimension: 'source' }],
      ['report_sales_by_hour', {}],
      ['report_sales_by_item', {}],
      ['report_sales_by_category', {}],
      ['report_payments', {}],
    ] as const
    const refused = run(
      fns.map(([fn, extra]) => ({ fn, args: { p_tenant: T_A, p_from: FROM, p_to: TO, ...extra }, as: staff(U.orders) })),
      applyHigh3,
    )
    expect(refused.map((result) => result.error?.code)).toEqual(fns.map(() => '42501'))
  })
})
