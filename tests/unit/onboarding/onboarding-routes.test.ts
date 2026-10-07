/** @jest-environment node */
import { NextRequest } from 'next/server'

const after = jest.fn()
const findOnboardingForToken = jest.fn()
const provisionStore = jest.fn()
const updateOnboardingAssets = jest.fn()

jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (fn: unknown) => after(fn) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
jest.mock('@/lib/rate-limit', () => ({ getClientIP: () => null }))
jest.mock('@/lib/onboarding/access', () => ({
  findOnboardingForToken: (...a: unknown[]) => findOnboardingForToken(...a),
  loadOnboardingView: jest.fn(),
}))
jest.mock('@/lib/onboarding/provision', () => ({ provisionStore: (...a: unknown[]) => provisionStore(...a) }))
jest.mock('@/lib/onboarding/build', () => ({ runOnboardingBuild: jest.fn() }))
jest.mock('@/lib/imagekit-server', () => ({ uploadBufferToImageKit: jest.fn() }))
jest.mock('@/lib/onboarding/repository', () => ({
  updateOnboardingAssets: (...a: unknown[]) => updateOnboardingAssets(...a),
}))

const TOKEN = 'a'.repeat(43)
const context = { params: Promise.resolve({ token: TOKEN }) }
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function onboarding(overrides: Record<string, unknown>) {
  return {
    id: 'onb-1', checkoutLeadId: 'lead-1', tenantId: 'tenant-1', status: 'running', answers: null,
    assets: { menuImageUrls: ['a.jpg'] }, steps: {}, summary: null, error: null, attempts: 1,
    launchRequestedAt: null, createdAt: minutesAgo(30), updatedAt: minutesAgo(1), ...overrides,
  }
}

function jsonRequest(method: string, body: unknown) {
  return new NextRequest(`https://www.webnegosyo.com/api/onboarding/${TOKEN}`, {
    method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('POST /api/onboarding/[token] retry', () => {
  test('a build that died mid-run (running, quiet past the stale window) can be retried', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'running', updatedAt: minutesAgo(10) }))

    const response = await POST(jsonRequest('POST', { action: 'retry' }), context)

    expect(response.status).toBe(200)
    expect(after).toHaveBeenCalledTimes(1)
  })

  test('a buyer cannot re-run the paid build past the attempt cap', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    const { MAX_BUYER_BUILD_ATTEMPTS } = await import('@/lib/onboarding/build-staleness')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'failed', attempts: MAX_BUYER_BUILD_ATTEMPTS }))

    const response = await POST(jsonRequest('POST', { action: 'retry' }), context)

    expect(response.status).toBe(429)
    expect(after).not.toHaveBeenCalled()
  })

  test('a build still making progress is not retried', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'running', updatedAt: minutesAgo(1) }))

    const response = await POST(jsonRequest('POST', { action: 'retry' }), context)

    expect(response.status).toBe(409)
    expect(after).not.toHaveBeenCalled()
  })
})

describe('POST /api/onboarding/[token] errors', () => {
  const SUBMIT = {
    answers: {
      storeName: 'Kape', storeType: 'restaurant', menuText: '', bestSellers: [],
      payments: { cash: true }, orderTypes: ['pickup'],
      hours: { open: '08:00', close: '20:00', closedDays: [], stopOrdersWhenClosed: false },
    },
    ownerPassword: 'long-enough-password',
  }

  test('an internal failure is not echoed to the caller', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    findOnboardingForToken.mockRejectedValue(new Error('Store set-up could not be read: connection to 10.0.0.4 refused'))

    const response = await POST(jsonRequest('POST', SUBMIT), context)
    const body = await response.json()

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(body.error).not.toMatch(/10\.0\.0\.4|could not be read/)
    expect(console.error).toHaveBeenCalled()
  })

  test('a raw failure from store creation is replaced by a generic message', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'awaiting_details', tenantId: null }))
    provisionStore.mockRejectedValue(new Error('Store set-up could not be queued: deadlock detected'))

    const response = await POST(jsonRequest('POST', SUBMIT), context)
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).not.toMatch(/deadlock|queued/)
  })

  test('a buyer-facing reason from store creation is kept', async () => {
    const { POST } = await import('@/app/api/onboarding/[token]/route')
    const { buyerFacingError } = await import('@/lib/onboarding/errors')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'awaiting_details', tenantId: null }))
    provisionStore.mockRejectedValue(buyerFacingError('This email already has a WebNegosyo login.'))

    const response = await POST(jsonRequest('POST', SUBMIT), context)
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toBe('This email already has a WebNegosyo login.')
  })
})

describe('DELETE /api/onboarding/[token]/upload', () => {
  test('removes against the fresh row and never echoes a database error', async () => {
    const { DELETE } = await import('@/app/api/onboarding/[token]/upload/route')
    findOnboardingForToken.mockResolvedValue(onboarding({ status: 'awaiting_details' }))
    updateOnboardingAssets.mockRejectedValue(new Error('Upload could not be saved: permission denied for table store_onboardings'))

    const response = await DELETE(jsonRequest('DELETE', { kind: 'menu', index: 0 }), context)
    const body = await response.json()

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(body.error).not.toMatch(/permission denied|store_onboardings/)
    expect(console.error).toHaveBeenCalled()
  })
})
