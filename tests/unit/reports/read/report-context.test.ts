import { buildReportContext, type BuildReportContextInput } from '@/lib/reports/read/report-context'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const O1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const O2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const O3 = 'aaaaaaaa-0000-4000-8000-0000000000a3'
// Wed 2026-10-14 15:30 Manila.
const NOW = Date.parse('2026-10-14T07:30:00Z')

const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null }

function input(extra: Partial<BuildReportContextInput> = {}): BuildReportContextInput {
  return {
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: true, hasConvexDeployment: false },
    backend: 'platform',
    appUser: owner,
    outlets: [
      { id: O1, name: 'Makati', isActive: true },
      { id: O2, name: 'BGC', isActive: true },
      { id: O3, name: 'Old Cubao', isActive: false },
    ],
    searchParams: {},
    now: NOW,
    ...extra,
  }
}

function ready(extra: Partial<BuildReportContextInput> = {}) {
  const state = buildReportContext(input(extra))
  if (state.kind !== 'ready') throw new Error(`expected ready, got ${state.kind}`)
  return state.context
}

describe('buildReportContext', () => {
  test('refuses before anything else, with the reason', () => {
    expect(buildReportContext(input({ appUser: null }))).toEqual({ kind: 'refused', reason: 'no_account' })
    expect(buildReportContext(input({ appUser: { ...owner, is_owner: false, permissions: ['orders'] } }))).toEqual({
      kind: 'refused',
      reason: 'no_permission',
    })
  })

  test('a store whose orders are not on the platform database is told plainly (Phase 7)', () => {
    expect(buildReportContext(input({ backend: 'convex' }))).toEqual({ kind: 'unsupported', backend: 'convex' })
  })

  test('a refusal outranks the backend: nobody learns a store’s setup without the key', () => {
    expect(buildReportContext(input({ backend: 'convex', appUser: null }))).toEqual({ kind: 'refused', reason: 'no_account' })
  })

  test('defaults: this week so far, compared with last week to the same moment, whole store', () => {
    const context = ready()
    expect(context.period).toMatchObject({ preset: 'this_week', from: '2026-10-12', isPartial: true, end: NOW })
    expect(context.compare).toMatchObject({ label: 'last week' })
    expect(context.windows.current).toEqual({
      tenantId: TENANT,
      start: Date.parse('2026-10-11T16:00:00Z'),
      end: NOW,
      branch: { p_outlet: null, p_unassigned: false },
    })
    expect(context.windows.previous).toEqual({
      tenantId: TENANT,
      start: Date.parse('2026-10-04T16:00:00Z'),
      end: NOW - 7 * 24 * 3600 * 1000,
      branch: { p_outlet: null, p_unassigned: false },
    })
    expect(context.today).toBe('2026-10-14')
  })

  test('compare=0 switches the comparison off', () => {
    const context = ready({ searchParams: { compare: '0' } })
    expect(context.compare).toBeNull()
    expect(context.windows.previous).toBeNull()
  })

  test('an impossible custom range shows the default and says why', () => {
    const context = ready({ searchParams: { period: 'custom', from: '2026-01-01', to: '2026-10-01' } })
    expect(context.period.preset).toBe('this_week')
    expect(context.filter).toMatchObject({ preset: 'this_week', from: null, to: null })
    expect(context.periodError).toBe('Pick a range of 93 days or less.')
  })

  test('a store-wide account on a multi-branch store gets the active branches and Unassigned', () => {
    const context = ready({ searchParams: { branch: O2 } })
    expect(context.branchOptions).toEqual([
      { value: O1, label: 'Makati' },
      { value: O2, label: 'BGC' },
      { value: 'unassigned', label: 'Unassigned' },
    ])
    expect(context.branch.args).toEqual({ p_outlet: O2, p_unassigned: false })
    expect(context.filter.branch).toBe(O2)
    // An inactive branch still names its old orders.
    expect(context.outletNames.get(O3)).toBe('Old Cubao')
  })

  test('a single-branch store has no picker', () => {
    const context = ready({ outlets: [{ id: O1, name: 'Makati', isActive: true }] })
    expect(context.isMultiBranch).toBe(false)
    expect(context.branchOptions).toBeNull()
  })

  test('a branch-locked manager reads only their branch, with a locked chip, whatever the URL says', () => {
    const context = ready({
      appUser: { ...owner, is_owner: false, permissions: ['reports'], outlet_id: O1 },
      searchParams: { branch: O2 },
    })
    expect(context.isBranchLocked).toBe(true)
    expect(context.branchOptions).toBeNull()
    expect(context.lockedBranchLabel).toBe('Makati')
    expect(context.windows.current.branch).toEqual({ p_outlet: O1, p_unassigned: false })
    expect(context.filter.branch).toBeNull()
  })

  test('a platform store with a leftover Convex deployment is flagged for a coverage note', () => {
    expect(ready({ tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: true } }).isMixedBackend).toBe(true)
  })
})
