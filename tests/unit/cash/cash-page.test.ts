/**
 * "Cash & remits" page access and context (CONTRACTS §8): mapped to
 * `cash_manage`, refused without it, cutoff editable only by the owner or a
 * store-wide `settings` holder, branch-locked accounts pinned to their branch,
 * and the day stepper on the BUSINESS day.
 */

import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import { buildCashPage, cashAccessFor, cashHref } from '@/lib/cash/cash-page'
import { permissionForAdminPath } from '@/lib/staff-permissions'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OUTLET_A = '33333333-3333-4333-8333-333333333333'
const OUTLET_B = '44444444-4444-4444-8444-444444444444'
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]
// Sun Oct 25, 2:00 AM Manila: still Saturday's business day on a 4 AM store.
const NOW = Date.parse('2026-10-24T18:00:00.000Z')

function staff(overrides: Partial<AppUserScopeRow> = {}): AppUserScopeRow {
  return { role: 'admin', tenant_id: TENANT_ID, is_owner: false, permissions: ['cash_manage'], outlet_id: null, ...overrides }
}

const OUTLETS = [
  { id: OUTLET_A, name: 'Main', isActive: true },
  { id: OUTLET_B, name: 'Mall', isActive: true },
]

function page(appUser: AppUserScopeRow | null, searchParams: Record<string, string> = {}, multiBranchEnabled = true) {
  return buildCashPage({
    tenant: { id: TENANT_ID, slug: 'lolys', multiBranchEnabled },
    appUser,
    outlets: OUTLETS,
    searchParams,
    schedule: FOUR_AM,
    now: NOW,
  })
}

describe('the /admin/cash section', () => {
  it('is mapped to cash_manage, so the middleware refuses staff without it', () => {
    expect(permissionForAdminPath('/lolys/admin/cash')).toBe('cash_manage')
    expect(permissionForAdminPath('/lolys/admin/cash/anything')).toBe('cash_manage')
  })
})

describe('cashAccessFor', () => {
  it('refuses staff without cash_manage, another store’s account and no account', () => {
    expect(cashAccessFor(staff({ permissions: ['pos', 'reports'] }), TENANT_ID)).toEqual({ ok: false, reason: 'no_permission' })
    expect(cashAccessFor(staff({ tenant_id: 'other' }), TENANT_ID)).toEqual({ ok: false, reason: 'other_store' })
    expect(cashAccessFor(null, TENANT_ID)).toEqual({ ok: false, reason: 'no_account' })
    expect(cashAccessFor(staff({ role: 'platform_staff' }), TENANT_ID)).toEqual({ ok: false, reason: 'no_permission' })
  })

  it('lets the owner and legacy full access in, with the cutoff editable', () => {
    expect(cashAccessFor(staff({ is_owner: true, permissions: [] }), TENANT_ID)).toMatchObject({ ok: true, canChangeCutoff: true })
    expect(cashAccessFor(staff({ permissions: null }), TENANT_ID)).toMatchObject({ ok: true, canChangeCutoff: true })
  })

  it('keeps the cutoff read-only without settings, or on a branch-locked account', () => {
    expect(cashAccessFor(staff(), TENANT_ID)).toMatchObject({ ok: true, canChangeCutoff: false })
    expect(cashAccessFor(staff({ permissions: ['cash_manage', 'settings'], outlet_id: OUTLET_A }), TENANT_ID)).toMatchObject({
      ok: true,
      canChangeCutoff: false,
    })
    expect(cashAccessFor(staff({ permissions: ['cash_manage', 'settings'] }), TENANT_ID)).toMatchObject({ ok: true, canChangeCutoff: true })
  })
})

describe('buildCashPage', () => {
  it('opens on the business day running now (2 AM Sunday is still Saturday on a 4 AM store)', () => {
    const state = page(staff())

    expect(state.kind === 'ready' && state.context).toMatchObject({
      day: '2026-10-24',
      today: '2026-10-24',
      previousDay: '2026-10-23',
      nextDay: null,
      cutoffLabel: '4:00 AM',
      tab: 'shifts',
    })
  })

  it('steps to a past day and offers the next one, but never a future day', () => {
    const past = page(staff(), { day: '2026-10-20' })
    const future = page(staff(), { day: '2026-10-30' })
    const garbled = page(staff(), { day: '2026-02-31' })

    expect(past.kind === 'ready' && past.context.nextDay).toBe('2026-10-21')
    expect(future.kind === 'ready' && [future.context.day, future.context.dayError !== null]).toEqual(['2026-10-24', true])
    expect(garbled.kind === 'ready' && [garbled.context.day, garbled.context.dayError !== null]).toEqual(['2026-10-24', true])
  })

  it('pins a branch-locked account to its own branch whatever the URL asks, without a picker', () => {
    const state = page(staff({ outlet_id: OUTLET_A }), { branch: OUTLET_B })

    expect(state.kind === 'ready' && state.context).toMatchObject({ outletId: OUTLET_A, branchOptions: null, lockedBranchLabel: 'Main' })
  })

  it('lets a store-wide account pick one of the store’s branches, and ignores anything else', () => {
    const picked = page(staff(), { branch: OUTLET_B })
    const foreign = page(staff(), { branch: '99999999-9999-4999-8999-999999999999' })

    expect(picked.kind === 'ready' && picked.context.outletId).toBe(OUTLET_B)
    expect(picked.kind === 'ready' && picked.context.branchOptions?.length).toBe(2)
    expect(foreign.kind === 'ready' && foreign.context.outletId).toBeNull()
  })

  it('shows no branch picker on a single-branch store', () => {
    const state = page(staff(), {}, false)

    expect(state.kind === 'ready' && state.context.branchOptions).toBeNull()
  })

  it('opens the Settings and To accept tabs from ?tab=, anything else is Shifts', () => {
    const settings = page(staff(), { tab: 'settings' })
    const accept = page(staff(), { tab: 'accept' })
    const junk = page(staff(), { tab: 'admin' })

    expect(settings.kind === 'ready' && settings.context.tab).toBe('settings')
    expect(accept.kind === 'ready' && accept.context.tab).toBe('accept')
    expect(junk.kind === 'ready' && junk.context.tab).toBe('shifts')
  })

  it('offers settling a dispute only to the owner', () => {
    const owner = page(staff({ is_owner: true }))
    const manager = page(staff())

    expect(owner.kind === 'ready' && owner.context.canResolve).toBe(true)
    expect(manager.kind === 'ready' && manager.context.canResolve).toBe(false)
  })

  it('refuses before deciding anything when the account may not open it', () => {
    expect(page(staff({ permissions: ['reports'] }))).toEqual({ kind: 'refused', reason: 'no_permission' })
  })
})

describe('cashHref', () => {
  it('keeps only what differs from the defaults', () => {
    expect(cashHref('lolys', { tab: 'shifts', day: '2026-10-24', today: '2026-10-24' })).toBe('/lolys/admin/cash')
    expect(cashHref('lolys', { tab: 'settings' })).toBe('/lolys/admin/cash?tab=settings')
    expect(cashHref('lolys', { day: '2026-10-20', today: '2026-10-24', branch: OUTLET_A })).toBe(`/lolys/admin/cash?day=2026-10-20&branch=${OUTLET_A}`)
  })
})
