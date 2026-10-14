import { reportAccessFor, reportBranchArgs } from '@/lib/reports/read/report-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUTLET = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUTLET_2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'

const admin = (extra: Record<string, unknown> = {}) => ({
  role: 'admin',
  tenant_id: TENANT,
  is_owner: false,
  permissions: ['reports'],
  outlet_id: null,
  ...extra,
})

describe('reportAccessFor — who may open sales reports (fails closed)', () => {
  test('no account row is refused, never read as store-wide', () => {
    expect(reportAccessFor(null, TENANT)).toEqual({ ok: false, reason: 'no_account' })
  })

  test('an owner sees the whole store', () => {
    expect(reportAccessFor(admin({ is_owner: true, permissions: [] }), TENANT)).toEqual({
      ok: true,
      scope: { kind: 'all' },
    })
  })

  test('a staff account with reports sees the whole store', () => {
    expect(reportAccessFor(admin(), TENANT)).toEqual({ ok: true, scope: { kind: 'all' } })
  })

  test('analytics implies reports', () => {
    expect(reportAccessFor(admin({ permissions: ['analytics'] }), TENANT).ok).toBe(true)
  })

  test('legacy full access (NULL permissions) may', () => {
    expect(reportAccessFor(admin({ permissions: null }), TENANT).ok).toBe(true)
  })

  test('the live queue (orders, pos) is not reports', () => {
    expect(reportAccessFor(admin({ permissions: ['orders', 'pos'] }), TENANT)).toEqual({
      ok: false,
      reason: 'no_permission',
    })
  })

  test('another store’s admin is refused', () => {
    expect(reportAccessFor(admin({ tenant_id: OTHER, is_owner: true }), TENANT)).toEqual({
      ok: false,
      reason: 'other_store',
    })
  })

  test('a branch-locked manager is confined to their branch', () => {
    expect(reportAccessFor(admin({ outlet_id: OUTLET }), TENANT)).toEqual({
      ok: true,
      scope: { kind: 'branch', outletId: OUTLET },
    })
  })

  test('a superadmin may read any store, store-wide', () => {
    expect(reportAccessFor({ role: 'superadmin', tenant_id: null, permissions: null }, TENANT)).toEqual({
      ok: true,
      scope: { kind: 'all' },
    })
  })

  test('platform staff are told plainly (the database refuses them too)', () => {
    expect(
      reportAccessFor({ role: 'platform_staff', tenant_id: null, platform_permissions: ['stores.view'] }, TENANT),
    ).toEqual({ ok: false, reason: 'platform_staff' })
  })

  test('an unknown role is refused', () => {
    expect(reportAccessFor({ role: 'customer', tenant_id: TENANT }, TENANT)).toEqual({
      ok: false,
      reason: 'no_permission',
    })
  })
})

describe('reportBranchArgs — the branch a report reads', () => {
  const all = { kind: 'all' } as const
  const locked = { kind: 'branch', outletId: OUTLET } as const
  const outlets = [OUTLET, OUTLET_2]

  test('store-wide with no pick reads every branch and the unassigned orders', () => {
    expect(reportBranchArgs(all, null, outlets)).toEqual({ branch: null, args: { p_outlet: null, p_unassigned: false } })
  })

  test('store-wide may pick one of the store’s branches', () => {
    expect(reportBranchArgs(all, OUTLET_2, outlets)).toEqual({
      branch: OUTLET_2,
      args: { p_outlet: OUTLET_2, p_unassigned: false },
    })
  })

  test('store-wide may pick the unassigned orders', () => {
    expect(reportBranchArgs(all, 'unassigned', outlets)).toEqual({
      branch: 'unassigned',
      args: { p_outlet: null, p_unassigned: true },
    })
  })

  test('a branch the store does not have falls back to the whole store', () => {
    expect(reportBranchArgs(all, 'cccccccc-0000-4000-8000-000000000001', outlets)).toEqual({
      branch: null,
      args: { p_outlet: null, p_unassigned: false },
    })
  })

  test('a branch-locked account always reads its own branch, whatever the URL asks', () => {
    const own = { branch: OUTLET, args: { p_outlet: OUTLET, p_unassigned: false } }
    expect(reportBranchArgs(locked, null, outlets)).toEqual(own)
    expect(reportBranchArgs(locked, OUTLET_2, outlets)).toEqual(own)
    expect(reportBranchArgs(locked, 'unassigned', outlets)).toEqual(own)
  })
})
