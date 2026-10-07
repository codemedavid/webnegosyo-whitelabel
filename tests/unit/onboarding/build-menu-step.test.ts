/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'

const parseMenuWithAi = jest.fn()
const importParsedMenu = jest.fn()
const findOnboardingById = jest.fn()
const claimOnboardingBuild = jest.fn()
const finishOnboardingBuild = jest.fn()
const writeOnboardingSteps = jest.fn()

jest.mock('@/lib/branding-write', () => ({ saveBrandingWithClient: jest.fn() }))
jest.mock('@/lib/menu-import/parse-menu-ai', () => ({ parseMenuWithAi: (...a: unknown[]) => parseMenuWithAi(...a) }))
jest.mock('@/lib/menu-import/import-parsed-menu', () => ({ importParsedMenu: (...a: unknown[]) => importParsedMenu(...a) }))
jest.mock('@/lib/menu-import/fetch-image', () => ({ fetchImageAsDataUrl: jest.fn(), fetchImageBuffer: jest.fn() }))
jest.mock('@/lib/payment-methods-service', () => ({ createPaymentMethod: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/bundles-service', () => ({ invalidateBundlesCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/menu-engineering-service', () => ({ invalidateCheckoutUpsellCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/complementary-pairs-service', () => ({ invalidateComplementaryPairsCache: jest.fn(async () => undefined) }))
jest.mock('@/lib/onboarding/logo-color', () => ({ extractBrandColorFromImage: jest.fn() }))
jest.mock('@/lib/onboarding/store-type', () => ({ buildLaunchBranding: jest.fn() }))
jest.mock('@/lib/onboarding/boost-autopilot', () => ({ applyLaunchBoost: jest.fn() }))
jest.mock('@/lib/onboarding/launch-loyalty', () => ({ launchStarterLoyalty: jest.fn() }))
jest.mock('@/lib/onboarding/repository', () => ({
  ...jest.requireActual('@/lib/onboarding/repository'),
  findOnboardingById: (...a: unknown[]) => findOnboardingById(...a),
  claimOnboardingBuild: (...a: unknown[]) => claimOnboardingBuild(...a),
  finishOnboardingBuild: (...a: unknown[]) => finishOnboardingBuild(...a),
  writeOnboardingSteps: (...a: unknown[]) => writeOnboardingSteps(...a),
}))

/**
 * menu_items writes fail (the best-seller flag); everything else succeeds.
 * The existing-dishes read (`.limit()`) answers `existingMenu`.
 */
function fakeAdmin(existingMenu: Array<{ id: string; name: string }> = []) {
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {}
      const result = table === 'menu_items'
        ? { data: null, error: { message: 'statement timeout' } }
        : { data: { slug: 'kape' }, error: null }
      for (const method of ['select', 'update', 'eq', 'in']) query[method] = () => query
      query.limit = () => Promise.resolve({ data: existingMenu, error: null })
      query.single = async () => result
      query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return query
    },
  } as unknown as SupabaseClient
  return client
}

const DONE = { status: 'done', detail: 'ok' }

beforeEach(() => {
  jest.clearAllMocks()
  claimOnboardingBuild.mockResolvedValue(true)
  findOnboardingById.mockResolvedValue({
    id: 'onb-1', checkoutLeadId: 'lead-1', tenantId: 'tenant-1', status: 'failed',
    answers: { storeName: 'Kape', storeType: 'restaurant', menuText: 'Adobo 180\nSinigang 220', bestSellers: ['Adobo'] },
    assets: {}, steps: { branding: DONE, store_setup: DONE, boost: DONE, loyalty: DONE },
    summary: null, error: null, attempts: 1, launchRequestedAt: null,
    createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
  })
  parseMenuWithAi.mockResolvedValue({ ok: true, data: { categories: [] } })
  importParsedMenu.mockResolvedValue({
    itemsCreated: 2, itemsFailed: 0, categoriesCreated: 1, categoriesSkipped: 0,
    createdItems: [{ id: 'i1', name: 'Adobo' }, { id: 'i2', name: 'Sinigang' }],
  })
})

describe('runOnboardingBuild — menu step', () => {
  test('a best-seller marking failure is a warning: the imported menu counts as done, so a retry never re-imports it', async () => {
    // Arrange
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Act
    await runOnboardingBuild(fakeAdmin() as never, 'onb-1')

    // Assert
    expect(importParsedMenu).toHaveBeenCalledTimes(1)
    const lastSteps = writeOnboardingSteps.mock.calls.at(-1)?.[2] as Record<string, { status: string }>
    expect(lastSteps.menu.status).toBe('done')
    const outcome = finishOnboardingBuild.mock.calls[0][2] as { status: string; summary: { warnings: string[] } }
    expect(outcome.status).toBe('ready')
    expect(outcome.summary.warnings.some((w) => /best sellers/i.test(w))).toBe(true)
  })

  test('a build taken over after the menu was imported (step left running) never imports it again', async () => {
    // Arrange
    const { runOnboardingBuild } = await import('@/lib/onboarding/build')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    findOnboardingById.mockResolvedValueOnce({
      id: 'onb-1', checkoutLeadId: 'lead-1', tenantId: 'tenant-1', status: 'running',
      answers: { storeName: 'Kape', storeType: 'restaurant', menuText: 'Adobo 180', bestSellers: [] },
      assets: {}, steps: { branding: DONE, menu: { status: 'running', detail: 'Reading your menu' }, store_setup: DONE, boost: DONE, loyalty: DONE },
      summary: null, error: null, attempts: 1, launchRequestedAt: null,
      createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
    })

    // Act
    await runOnboardingBuild(fakeAdmin([{ id: 'i1', name: 'Adobo' }]) as never, 'onb-1')

    // Assert
    expect(parseMenuWithAi).not.toHaveBeenCalled()
    expect(importParsedMenu).not.toHaveBeenCalled()
    const lastSteps = writeOnboardingSteps.mock.calls.at(-1)?.[2] as Record<string, { status: string }>
    expect(lastSteps.menu.status).toBe('done')
  })
})
