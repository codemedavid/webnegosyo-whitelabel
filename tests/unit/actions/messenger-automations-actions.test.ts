/** @jest-environment node */
jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const verifyTenantPermission = jest.fn()
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args) }))

const rpc = jest.fn()
const settingsUpdate = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      if (table === 'messenger_settings') {
        const query = { update: (patch: unknown) => { settingsUpdate(patch); return query }, eq: () => query, select: async () => ({ data: [{ tenant_id: 't' }], error: null }) }
        return query
      }
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { slug: 'karamotan', facebook_page_id: null }, error: null }) }
      return query
    },
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getTenantActivePageById: jest.fn() }))
const syncMessengerProfile = jest.fn(async () => ({ outcome: 'no_page' }))
jest.mock('@/lib/messenger/profile-sync', () => ({ syncMessengerProfile: (...args: unknown[]) => syncMessengerProfile(...(args as [])) }))
jest.mock('@/lib/messenger/load-store', () => ({ loadStoreBundle: jest.fn() }))
jest.mock('@/lib/messenger/session', () => ({ touchSession: jest.fn() }))
jest.mock('@/lib/messenger/send', () => ({ sendMessages: jest.fn() }))

import { saveMessengerAutomationsAction } from '@/app/actions/messenger-automations'
import { DEFAULT_RULES } from '@/lib/messenger/rules'

const TENANT = '0b0c9d3c-1111-4000-8000-0000000000ff'
const input = { tenantId: TENANT, expectedVersion: 0, rules: [...DEFAULT_RULES], botEnabled: true, takeoverMinutes: 60 }
const owner = { user: { id: 'u1' }, userRole: { role: 'admin', tenant_id: TENANT, is_owner: true, outlet_id: null } }

beforeEach(() => {
  verifyTenantPermission.mockReset().mockResolvedValue(owner)
  rpc.mockReset().mockResolvedValue({ data: 1, error: null })
  settingsUpdate.mockReset()
})

describe('saveMessengerAutomationsAction', () => {
  it('needs the settings permission', async () => {
    verifyTenantPermission.mockRejectedValue(new Error('Unauthorized'))
    expect(await saveMessengerAutomationsAction(input)).toMatchObject({ ok: false, error: expect.stringContaining('Settings permission') })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a branch-locked account', async () => {
    verifyTenantPermission.mockResolvedValue({ user: { id: 'u2' }, userRole: { role: 'admin', tenant_id: TENANT, is_owner: false, outlet_id: 'branch-1' } })
    expect(await saveMessengerAutomationsAction(input)).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves the built-in rules as the store\'s own, with real ids, in order', async () => {
    const result = await saveMessengerAutomationsAction(input)
    expect(result).toMatchObject({ ok: true, version: 1 })
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('save_messenger_rules')
    expect(args.p_expected_version).toBe(0)
    expect(args.p_rules.map((rule: { name: string }) => rule.name)).toEqual(DEFAULT_RULES.map((rule) => rule.name))
    for (const rule of args.p_rules) expect(rule.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(args).toMatchObject({ p_bot_enabled: true, p_takeover_minutes: 60 })
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('a stale editor gets told to reload', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'changed' } })
    expect(await saveMessengerAutomationsAction(input)).toMatchObject({ ok: false, error: expect.stringContaining('Reload') })
  })

  it('refuses what Meta would cap, and junk input', async () => {
    const ice = (n: number) => ({ id: `ice-${n}`, name: 'q', isEnabled: true, trigger: { kind: 'ice_breaker' as const, question: 'Q?' }, action: { kind: 'menu_card' as const } })
    expect(await saveMessengerAutomationsAction({ ...input, rules: [1, 2, 3, 4, 5].map(ice) })).toMatchObject({ ok: false, error: expect.stringContaining('4') })
    expect(await saveMessengerAutomationsAction({ ...input, takeoverMinutes: 7 })).toMatchObject({ ok: false })
    expect(await saveMessengerAutomationsAction({ ...input, tenantId: 'nope' })).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
})
