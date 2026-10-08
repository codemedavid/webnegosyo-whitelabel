/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'

const findOnboardingById = jest.fn()
const claimOnboardingBuild = jest.fn()
const finishOnboardingBuild = jest.fn()
const writeOnboardingSteps = jest.fn()
const launchFromSetupLink = jest.fn()
const invalidateTenantCache = jest.fn(async () => undefined)

jest.mock('@/lib/branding-write', () => ({ saveBrandingWithClient: jest.fn() }))
jest.mock('@/lib/menu-import/parse-menu-ai', () => ({ parseMenuWithAi: jest.fn() }))
jest.mock('@/lib/menu-import/import-parsed-menu', () => ({ importParsedMenu: jest.fn() }))
jest.mock('@/lib/menu-import/fetch-image', () => ({ fetchImageAsDataUrl: jest.fn(), fetchImageBuffer: jest.fn() }))
jest.mock('@/lib/payment-methods-service', () => ({ createPaymentMethod: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: (...a: unknown[]) => invalidateTenantCache(...(a as [])) }))
jest.mock('@/lib/bundles-service', () => ({ invalidateBundlesCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/menu-engineering-service', () => ({ invalidateCheckoutUpsellCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/complementary-pairs-service', () => ({ invalidateComplementaryPairsCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/onboarding/logo-color', () => ({ extractBrandColorFromImage: jest.fn() }))
jest.mock('@/lib/onboarding/store-type', () => ({ buildLaunchBranding: jest.fn() }))
jest.mock('@/lib/onboarding/boost-autopilot', () => ({ applyLaunchBoost: jest.fn() }))
jest.mock('@/lib/onboarding/launch-loyalty', () => ({ launchStarterLoyalty: jest.fn() }))
jest.mock('@/lib/onboarding/buyer-launch', () => ({ launchFromSetupLink: (...a: unknown[]) => launchFromSetupLink(...a) }))
jest.mock('@/lib/onboarding/repository', () => ({
  ...jest.requireActual('@/lib/onboarding/repository'),
  findOnboardingById: (...a: unknown[]) => findOnboardingById(...a),
  claimOnboardingBuild: (...a: unknown[]) => claimOnboardingBuild(...a),
  finishOnboardingBuild: (...a: unknown[]) => finishOnboardingBuild(...a),
  writeOnboardingSteps: (...a: unknown[]) => writeOnboardingSteps(...a),
}))

function fakeAdmin() {
  return {
    from() {
      const query: Record<string, unknown> = {}
      const result = { data: { slug: 'kape' }, error: null }
      for (const method of ['select', 'update', 'eq', 'in']) query[method] = () => query
      query.single = async () => result
      query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return query
    },
  } as unknown as SupabaseClient
}

const DONE = { status: 'done', detail: 'ok' }

function onboardingRow(status: string) {
  return {
    id: 'onb-1', checkoutLeadId: 'lead-1', tenantId: 'tenant-1', status,
    answers: { storeName: 'Kape', storeType: 'cafe', menuText: 'Latte 150', bestSellers: [] },
    assets: {}, steps: { branding: DONE, menu: DONE, store_setup: DONE, boost: DONE, loyalty: DONE },
    summary: null, error: null, attempts: 1, launchRequestedAt: null,
    createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  claimOnboardingBuild.mockResolvedValue(true)
  findOnboardingById
    .mockResolvedValueOnce(onboardingRow('queued'))
    .mockResolvedValueOnce(onboardingRow('ready'))
  launchFromSetupLink.mockResolvedValue({ ok: true })
})

describe('runOnboardingBuild — opens the store when the build finishes', () => {
  test('a finished build opens the store through the Go live rules, using the FINISHED row (not the queued one)', async () => {
    // Arrange
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')

    // Act
    await runOnboardingBuild(fakeAdmin() as never, 'onb-1')

    // Assert
    expect(finishOnboardingBuild).toHaveBeenCalledWith(expect.anything(), 'onb-1', expect.objectContaining({ status: 'ready' }))
    expect(launchFromSetupLink).toHaveBeenCalledTimes(1)
    expect(launchFromSetupLink.mock.calls[0][1]).toEqual(expect.objectContaining({ id: 'onb-1', status: 'ready' }))
    expect(finishOnboardingBuild.mock.invocationCallOrder[0]).toBeLessThan(launchFromSetupLink.mock.invocationCallOrder[0])
  })

  test('a refused launch (e.g. no menu) leaves the store closed without failing the build', async () => {
    // Arrange
    launchFromSetupLink.mockResolvedValue({ ok: false, status: 409, error: 'Finish these first: Add your menu.' })
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')

    // Act
    await expect(runOnboardingBuild(fakeAdmin() as never, 'onb-1')).resolves.toBeUndefined()

    // Assert
    expect(finishOnboardingBuild).toHaveBeenCalledTimes(1)
    expect(invalidateTenantCache).toHaveBeenCalled()
  })

  test('a launch that throws is logged, never surfaces, and the store caches are still refreshed', async () => {
    // Arrange
    launchFromSetupLink.mockRejectedValue(new Error('network down'))
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')

    // Act
    await expect(runOnboardingBuild(fakeAdmin() as never, 'onb-1')).resolves.toBeUndefined()

    // Assert
    expect(console.error).toHaveBeenCalledWith('[onboarding] auto go-live failed', expect.objectContaining({ onboardingId: 'onb-1' }))
    expect(invalidateTenantCache).toHaveBeenCalledWith('kape', 'tenant-1')
  })

  test('a build that loses the claim never tries to open the store', async () => {
    // Arrange
    claimOnboardingBuild.mockResolvedValue(false)
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')

    // Act
    await runOnboardingBuild(fakeAdmin() as never, 'onb-1')

    // Assert
    expect(launchFromSetupLink).not.toHaveBeenCalled()
  })
})
