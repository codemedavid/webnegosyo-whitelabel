/**
 * @jest-environment node
 *
 * `defineAction` gives a server action the same declared way in as a route.
 * A server action is a public POST endpoint whatever the page that imports it
 * checks, so the handler runs only after the caller, the limit and the
 * arguments held. Mocked at the existing access helpers.
 */

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SUBSCRIPTION_PAUSED_MESSAGE, SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import { PlatformAccessError } from '@/lib/platform-staff/guard'
import { defineAction } from '@/platform/http/define-action'
import { describeEntry } from '@/platform/http/entry'

const mockVerifyAdmin = jest.fn()
const mockVerifyPermission = jest.fn()
const mockRequestCaller = jest.fn()
const mockPlatformPermission = jest.fn()
const mockRateLimit = jest.fn()
const mockActionRateLimit = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: (...args: unknown[]) => mockVerifyAdmin(...args),
  verifyTenantPermission: (...args: unknown[]) => mockVerifyPermission(...args),
}))
jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: () => mockRequestCaller() }))
jest.mock('@/lib/platform-staff/guard', () => ({
  ...jest.requireActual<typeof import('@/lib/platform-staff/guard')>('@/lib/platform-staff/guard'),
  requirePlatformPermission: (...args: unknown[]) => mockPlatformPermission(...args),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/action-rate-limit', () => ({ checkActionRateLimit: (...args: unknown[]) => mockActionRateLimit(...args) }))
jest.mock('@sentry/nextjs', () => ({ captureException: (...args: unknown[]) => mockCaptureException(...args) }))

const TENANT = 'store-1'
const OTHER_TENANT = 'store-2'
const USER = { id: 'user-1' }

function account(overrides: Record<string, unknown> = {}) {
  return { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['menu'], outlet_id: null, ...overrides }
}

const handler = jest.fn()
const inputSchema = z.object({ tenantId: z.string().min(1), name: z.string().min(1) })

function renameAction() {
  return defineAction({
    auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([input]) => input.tenantId },
    args: [inputSchema],
    handler: async (context): Promise<{ success: true; name: string } | { success: false; error: string }> => {
      handler(context)
      return { success: true, name: context.args[0].name }
    },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockVerifyAdmin.mockResolvedValue({ user: USER, userRole: account() })
  mockVerifyPermission.mockResolvedValue({ user: USER, userRole: account() })
  mockRequestCaller.mockResolvedValue({ user: USER, appUser: account(), roleError: null })
  mockPlatformPermission.mockResolvedValue({ user: USER, appUser: { role: 'superadmin', tenant_id: null } })
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 1 })
  mockActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
})

afterEach(() => jest.restoreAllMocks())

describe('staff action', () => {
  it('runs the handler for a caller holding the key, through verifyTenantPermission', async () => {
    const result = await renameAction()({ tenantId: TENANT, name: 'Adobo' })

    expect(result).toEqual({ success: true, name: 'Adobo' })
    expect(mockVerifyPermission).toHaveBeenCalledWith(TENANT, 'menu', 'edit')
    expect(handler.mock.calls[0][0]).toMatchObject({ tenant: TENANT, user: USER, args: [{ tenantId: TENANT, name: 'Adobo' }] })
  })

  it.each([
    ['Unauthorized: Not authenticated', 'Please sign in again.'],
    ['Unauthorized: Not admin of this tenant', 'You do not have access to this store.'],
    ['Unauthorized: Missing permission for this feature', 'You do not have permission for this.'],
  ])('answers "%s" with a sentence, not the internal message', async (message, sentence) => {
    mockVerifyPermission.mockRejectedValue(new Error(message))

    expect(await renameAction()({ tenantId: TENANT, name: 'Adobo' })).toEqual({ success: false, error: sentence })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a paused store with the sentence written for the merchant', async () => {
    mockVerifyPermission.mockRejectedValue(new SubscriptionPausedError())

    expect(await renameAction()({ tenantId: TENANT, name: 'Adobo' })).toEqual({ success: false, error: SUBSCRIPTION_PAUSED_MESSAGE })
  })

  it('fails closed when the access check throws something it does not recognise', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('column app_users.outlet_id does not exist'))

    const result = await renameAction()({ tenantId: TENANT, name: 'Adobo' })

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses arguments that fail their schema before any access check', async () => {
    const result = await renameAction()({ tenantId: TENANT, name: '' })

    expect(result).toEqual({ success: false, error: 'Check the details and try again.' })
    expect(mockVerifyPermission).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it('drops arguments the action did not declare', async () => {
    const action = renameAction() as unknown as (...args: unknown[]) => Promise<unknown>

    await action({ tenantId: TENANT, name: 'Adobo', isOwner: true }, 'smuggled')

    expect(handler.mock.calls[0][0].args).toEqual([{ tenantId: TENANT, name: 'Adobo' }])
  })

  it('uses the session account’s store when the action names none, whatever the arguments say', async () => {
    const action = defineAction({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any', access: 'view' },
      args: [z.object({ tenantId: z.string() })],
      handler: async ({ tenant }) => ({ success: true as const, tenant }),
    })

    expect(await action({ tenantId: OTHER_TENANT })).toEqual({ success: true, tenant: TENANT })
    expect(mockVerifyAdmin).toHaveBeenCalledWith(TENANT, 'view')
  })

  it('refuses a signed-out caller of an action that names no store', async () => {
    mockRequestCaller.mockResolvedValue({ user: null, appUser: null, roleError: null })
    const action = defineAction({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any' },
      args: [],
      handler: async () => ({ success: true as const }),
    })

    expect(await action()).toEqual({ success: false, error: 'Please sign in again.' })
    expect(mockVerifyAdmin).not.toHaveBeenCalled()
  })

  it("holds a 'store-wide' action back from a branch-locked account", async () => {
    mockVerifyPermission.mockResolvedValue({ user: USER, userRole: account({ outlet_id: 'branch-north' }) })
    const action = defineAction({
      auth: { kind: 'staff', permission: 'menu', branch: 'store-wide', storeClaim: ([tenantId]) => tenantId },
      args: [z.string()],
      handler: async () => ({ success: true as const }),
    })

    expect(await action(TENANT)).toEqual({ success: false, error: 'Only store-wide accounts can do this.' })
  })

  it('counts per person after the access check and refuses over the limit', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
    const action = defineAction({
      auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([tenantId]) => tenantId },
      rateLimit: { bucket: 'ai-write', per: 'user', max: 5, window: '1h', onRedisFailure: 'refuse' },
      args: [z.string()],
      handler: async () => ({ success: true as const }),
    })

    expect(await action(TENANT)).toEqual({ success: false, error: 'Too many attempts. Please try again in a moment.' })
    expect(mockRateLimit).toHaveBeenCalledWith('ai-write:user-1', { limit: 5, windowSec: 3600, onRedisFailure: 'refuse' })
  })
})

describe('superadmin action', () => {
  const action = () =>
    defineAction({
      auth: { kind: 'superadmin', permission: 'settings.edit' },
      args: [z.string().min(1)],
      handler: async ({ user, args: [tag] }) => ({ success: true as const, by: user.id, tag }),
    })

  it('admits a console account holding the grant', async () => {
    expect(await action()('spicy')).toEqual({ success: true, by: 'user-1', tag: 'spicy' })
    expect(mockPlatformPermission).toHaveBeenCalledWith('settings.edit')
  })

  it('refuses a console account without it', async () => {
    mockPlatformPermission.mockRejectedValue(new PlatformAccessError('Forbidden: You do not have access to do this'))

    expect(await action()('spicy')).toEqual({ success: false, error: 'You do not have access to this store.' })
  })
})

describe('public action', () => {
  const action = () =>
    defineAction({
      auth: { kind: 'public' },
      rateLimit: { bucket: 'preflight', per: 'ip', max: 20, window: '1m' },
      args: [z.string().uuid()],
      handler: async () => ({ success: true as const }),
    })

  it('counts by client address before looking at the arguments', async () => {
    mockActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 12 })

    expect(await action()('not-a-uuid')).toEqual({ success: false, error: 'Too many attempts. Please try again in a moment.' })
    expect(mockActionRateLimit).toHaveBeenCalledWith('preflight', { limit: 20, windowSec: 60, onRedisFailure: undefined })
  })

  it('must state its limit', () => {
    const define = defineAction as unknown as (declaration: Record<string, unknown>) => unknown

    expect(() => define({ auth: { kind: 'public' }, args: [], handler: async () => ({ success: true }) })).toThrow(/rateLimit/)
  })
})

describe('a handler that throws', () => {
  it('returns a fixed sentence and keeps the error for the log and Sentry', async () => {
    const failure = new Error('null value in column "tenant_id" violates not-null constraint')
    const action = defineAction({
      auth: { kind: 'public' },
      rateLimit: { per: 'none', reason: 'test' },
      args: [],
      handler: async (): Promise<{ success: true } | { success: false; error: string }> => {
        throw failure
      },
    })

    const result = await action()

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).toContain('not-null constraint')
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockCaptureException).toHaveBeenCalledWith(failure, expect.anything())
  })

  it('lets redirect() through', async () => {
    const action = defineAction({
      auth: { kind: 'public' },
      rateLimit: { per: 'none', reason: 'test' },
      args: [],
      handler: async (): Promise<{ success: true } | { success: false; error: string }> => redirect('/login'),
    })

    await expect(action()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  })
})

describe('onRefusal', () => {
  it('words every refusal for an action whose result is not { success, error }', async () => {
    mockVerifyAdmin.mockRejectedValue(new Error('Unauthorized: Not admin of this tenant'))
    const action = defineAction({
      auth: { kind: 'staff', permission: 'any-staff', branch: 'any', access: 'view', storeClaim: ([tenantId]) => tenantId },
      args: [z.string()],
      onRefusal: () => null,
      handler: async ({ tenant }): Promise<{ storeName: string } | null> => ({ storeName: tenant }),
    })

    expect(await action(OTHER_TENANT)).toBeNull()
  })

  it('is told which rule refused and what the schema rejected', async () => {
    const seen = jest.fn()
    const action = defineAction({
      auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([input]) => input.tenantId },
      args: [inputSchema],
      onRefusal: (refusal) => {
        seen(refusal.code, refusal.issues?.[0]?.path)
        return { success: false as const, error: 'Unknown dish.' }
      },
      handler: async () => ({ success: true as const }),
    })

    expect(await action({ tenantId: TENANT, name: '' })).toEqual({ success: false, error: 'Unknown dish.' })
    expect(seen).toHaveBeenCalledWith('invalid', ['name'])
  })
})

describe('what a "use server" file may export', () => {
  it('returns an async function carrying its declaration', async () => {
    const action = renameAction()

    expect(typeof action).toBe('function')
    expect(action({ tenantId: TENANT, name: 'Adobo' })).toBeInstanceOf(Promise)
    expect(describeEntry(action)).toEqual({
      type: 'action',
      auth: { kind: 'staff', permission: 'menu', branch: 'any', access: 'edit', session: 'cookie', namesStore: true },
      rateLimit: null,
      validates: ['args'],
    })
  })

  it.each([
    ['a Bearer-only action', { auth: { kind: 'staff', permission: 'pos', branch: 'any', session: 'bearer' } }, /Bearer-only/],
    ['a cron action', { auth: { kind: 'cron' } }, /cannot be kind/],
    ['a staff action without a permission', { auth: { kind: 'staff', branch: 'any' } }, /permission/],
  ])('refuses %s when the module loads', (_name, declaration, message) => {
    const define = defineAction as unknown as (declaration: Record<string, unknown>) => unknown

    expect(() => define({ args: [], handler: async () => ({ success: true }), ...declaration })).toThrow(message)
  })
})

/** Compile-time half of the contract: checked by `tsc`, never run. */
export function typeContract() {
  const ok = async () => ({ success: true as const })
  // @ts-expect-error a public action must state its rate limit
  defineAction({ auth: { kind: 'public' }, args: [], handler: ok })
  // @ts-expect-error a staff action must name its permission
  defineAction({ auth: { kind: 'staff', branch: 'any' }, args: [], handler: ok })
  const plain = defineAction({ auth: { kind: 'superadmin', permission: 'full-superadmin' }, args: [], handler: async () => 5 })
  // @ts-expect-error without onRefusal the result may be the standard failure, so it is not just the handler's
  const count: Promise<number> = plain()
  const worded = defineAction({ auth: { kind: 'superadmin', permission: 'full-superadmin' }, args: [], onRefusal: () => null, handler: async () => 5 })
  const counted: Promise<number | null> = worded()
  void [count, counted]
  // @ts-expect-error the arguments are typed by their schemas
  void renameAction()({ tenantId: 5, name: 'x' })
}
