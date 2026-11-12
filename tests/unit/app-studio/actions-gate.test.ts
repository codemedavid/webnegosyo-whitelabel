/** @jest-environment node */
/**
 * Server Actions are public POST endpoints: every App Studio action must ask
 * for its console grant before it touches the service-role client.
 */
const requirePlatformPermission = jest.fn()
const createAdminClient = jest.fn()
jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: (...a: unknown[]) => requirePlatformPermission(...a) }))
jest.mock('@/lib/supabase/admin', () => ({ ADMIN_QUERY_TIMEOUT_MS: 8000, createAdminClient: (...a: unknown[]) => createAdminClient(...a) }))
jest.mock('@/lib/app-studio/preview-input', () => ({ loadAppStudioStore: jest.fn() }))

import { describeEntry } from '@/platform/http/entry'

const TENANT = '00000000-0000-4000-8000-000000000001'

const CALLS: [string, unknown[], string][] = [
  ['listAppStudioAppsAction', [], 'customer_apps.view'],
  ['listStoresWithoutAppAction', [], 'customer_apps.view'],
  ['createAppStudioAppAction', [TENANT], 'customer_apps.edit'],
  ['saveAppIdentityAction', [TENANT, {}], 'customer_apps.edit'],
  ['saveAppListingAction', [TENANT, {}], 'customer_apps.edit'],
  ['saveAppReleaseAction', [TENANT, {}], 'customer_apps.edit'],
  ['issueAppReviewCodeAction', [TENANT, '+639171234567'], 'customer_apps.edit'],
  ['clearAppReviewCodeAction', [TENANT], 'customer_apps.edit'],
  ['saveAppDraftAction', [TENANT, {}], 'customer_apps.edit'],
  ['publishAppDraftAction', [TENANT, {}, 0], 'customer_apps.edit'],
  ['discardAppDraftAction', [TENANT], 'customer_apps.edit'],
]

describe('App Studio actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const refusal = new Error('Forbidden: You do not have access to do this')
    refusal.name = 'PlatformAccessError'
    requirePlatformPermission.mockRejectedValue(refusal)
  })

  it('covers every exported action', async () => {
    const actions = await import('@/app/actions/app-studio')
    const exported = Object.entries(actions).filter(([, value]) => typeof value === 'function').map(([name]) => name).sort()
    expect(exported).toEqual(CALLS.map(([name]) => name).sort())
  })

  it.each(CALLS)('%s is declared with %s and refuses before any database work', async (name, args, permission) => {
    const actions = (await import('@/app/actions/app-studio')) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
    expect(describeEntry(actions[name])?.auth).toMatchObject({ kind: 'superadmin', permission })
    const answer = actions[name](...args)
    if (name.startsWith('list')) await expect(answer).rejects.toThrow()
    else await expect(answer).resolves.toMatchObject({ ok: false })
    expect(requirePlatformPermission).toHaveBeenCalledWith(permission)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
