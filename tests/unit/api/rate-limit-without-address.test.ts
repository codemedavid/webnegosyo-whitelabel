/**
 * @jest-environment node
 *
 * Routes a browser or a phone calls are limited per client address. A request
 * whose address nobody could read is still counted: all such requests share
 * ONE bucket (`<scope>:unknown`), so "no address" is never "no limit".
 *
 * The two push routes are the exception, pinned at the bottom: the database
 * calls them (pg_net, once, never retried), so there a request with no
 * address is let through uncounted, as before.
 */

import { NextRequest } from 'next/server'

const mockCheckRateLimit = jest.fn()

jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))
// Nothing behind the limit may run in these tests; each of these would fail loudly if it did.
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn(() => { throw new Error('reached the database') }) }))
jest.mock('@/lib/imagekit-server', () => ({
  createSignedUploadToken: jest.fn(() => { throw new Error('signed an upload') }),
  uploadBufferToImageKit: jest.fn(() => { throw new Error('uploaded') }),
  deletePaymentProofAsset: jest.fn(() => { throw new Error('deleted') }),
}))
jest.mock('@/lib/imagekit-uploader-auth', () => ({
  resolveImageKitUploader: jest.fn(() => { throw new Error('resolved an uploader') }),
}))
jest.mock('@/lib/storage/r2-server', () => ({ newObjectKey: jest.fn(), presignR2Put: jest.fn() }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: jest.fn() }))
jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: jest.fn() }))
jest.mock('@/lib/onboarding/access', () => ({ findOnboardingForToken: jest.fn(() => { throw new Error('read a set-up link') }) }))
jest.mock('@/lib/onboarding/repository', () => ({ publicAssets: jest.fn(), updateOnboardingAssets: jest.fn() }))
jest.mock('@/lib/onboarding/logo-color', () => ({ extractBrandColorFromImage: jest.fn() }))
jest.mock('@/lib/onboarding/provision', () => ({ provisionStore: jest.fn(() => { throw new Error('created a store') }) }))
jest.mock('@/lib/onboarding/build', () => ({ runOnboardingBuild: jest.fn(() => { throw new Error('built a store') }) }))
jest.mock('@/lib/onboarding/buyer-launch', () => ({ launchFromSetupLink: jest.fn(() => { throw new Error('opened a store') }) }))
jest.mock('@/lib/onboarding/menu-read-run', () => ({ requestMenuRead: jest.fn(() => { throw new Error('read a menu') }) }))
jest.mock('@/lib/onboarding/launch-offers', () => ({
  LaunchOfferError: class LaunchOfferError extends Error {},
  decideLaunchCombo: jest.fn(() => { throw new Error('decided a combo') }),
  readLaunchCombos: jest.fn(() => { throw new Error('read the combos') }),
}))
jest.mock('@/lib/onboarding/events', () => ({
  isClientEvent: () => true,
  recordOnboardingEvent: jest.fn(() => { throw new Error('recorded an event') }),
}))
jest.mock('@/app/actions/orders', () => ({ createOrderAction: jest.fn(() => { throw new Error('placed an order') }) }))
jest.mock('@/lib/delivery/order-delivery-edit-server', () => ({
  saveOrderDeliveryEdit: jest.fn(() => { throw new Error('moved a pin') }),
}))
jest.mock('@/lib/maps/resolve-map-link', () => ({ resolveShortMapLink: jest.fn(() => { throw new Error('followed a link') }) }))
jest.mock('@/lib/booking/slots', () => ({ getAvailableSlots: jest.fn(() => { throw new Error('read the slots') }) }))
jest.mock('@/lib/presell/calendar-read', () => ({ getPresellCalendar: jest.fn(() => { throw new Error('read the calendar') }) }))

const ORIGIN = 'https://www.webnegosyo.com'
const TOKEN = 'a'.repeat(43)
const tokenContext = { params: Promise.resolve({ token: TOKEN }) }

type Handler = (request: NextRequest, context: typeof tokenContext) => Promise<Response>

interface Case {
  name: string
  bucket: string
  load: () => Promise<Handler>
  path: string
  method: 'GET' | 'POST' | 'DELETE'
  /** For a route that reads its body before it counts the request. */
  body?: unknown
}

const json = { 'content-type': 'application/json' }

const CASES: Case[] = [
  {
    name: 'POST /api/uploads/sign',
    bucket: 'uploads-sign',
    load: async () => (await import('@/app/api/uploads/sign/route')).POST as unknown as Handler,
    path: '/api/uploads/sign',
    method: 'POST',
  },
  {
    name: 'POST /api/imagekit/auth',
    bucket: 'imagekit-auth',
    load: async () => (await import('@/app/api/imagekit/auth/route')).POST as unknown as Handler,
    path: '/api/imagekit/auth',
    method: 'POST',
  },
  {
    name: 'GET /api/imagekit/auth',
    bucket: 'imagekit-auth',
    load: async () => (await import('@/app/api/imagekit/auth/route')).GET as unknown as Handler,
    path: '/api/imagekit/auth',
    method: 'GET',
  },
  {
    name: 'POST /api/payment-proof/upload',
    bucket: 'payment-proof-upload',
    load: async () => (await import('@/app/api/payment-proof/upload/route')).POST as unknown as Handler,
    path: '/api/payment-proof/upload',
    method: 'POST',
  },
  {
    name: 'POST /api/payment-proof/delete',
    bucket: 'payment-proof-delete',
    load: async () => (await import('@/app/api/payment-proof/delete/route')).POST as unknown as Handler,
    path: '/api/payment-proof/delete',
    method: 'POST',
  },
  {
    name: 'POST /api/onboarding/[token]/upload',
    bucket: 'onboarding-upload',
    load: async () => (await import('@/app/api/onboarding/[token]/upload/route')).POST as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/upload`,
    method: 'POST',
  },
  {
    name: 'DELETE /api/onboarding/[token]/upload',
    bucket: 'onboarding-upload-remove',
    load: async () => (await import('@/app/api/onboarding/[token]/upload/route')).DELETE as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/upload`,
    method: 'DELETE',
  },
  {
    name: 'GET /api/orders/track-by-client',
    bucket: 'track-by-client',
    load: async () => (await import('@/app/api/orders/track-by-client/route')).GET as unknown as Handler,
    path: '/api/orders/track-by-client?cid=c-1&tenant=demo',
    method: 'GET',
  },
  {
    name: 'POST /api/orders/pin',
    bucket: 'order-pin-ip',
    load: async () => (await import('@/app/api/orders/pin/route')).POST as unknown as Handler,
    path: '/api/orders/pin',
    method: 'POST',
  },
  {
    name: 'POST /api/orders/customer-app',
    bucket: 'customer-app-order-ip',
    load: async () => (await import('@/app/api/orders/customer-app/route')).POST as unknown as Handler,
    path: '/api/orders/customer-app',
    method: 'POST',
  },
  {
    name: 'POST /api/maps/resolve-link',
    bucket: 'maps-resolve-link',
    load: async () => (await import('@/app/api/maps/resolve-link/route')).POST as unknown as Handler,
    path: '/api/maps/resolve-link',
    method: 'POST',
    body: { url: 'https://maps.app.goo.gl/AbCdEf123' },
  },
  {
    name: 'POST /api/onboarding/[token]',
    bucket: 'onboarding-submit',
    load: async () => (await import('@/app/api/onboarding/[token]/route')).POST as unknown as Handler,
    path: `/api/onboarding/${TOKEN}`,
    method: 'POST',
  },
  {
    name: 'POST /api/onboarding/[token]/menu-read',
    bucket: 'onboarding-menu-read',
    load: async () => (await import('@/app/api/onboarding/[token]/menu-read/route')).POST as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/menu-read`,
    method: 'POST',
  },
  {
    name: 'GET /api/onboarding/[token]/launch-offers',
    bucket: 'onboarding-launch-offers',
    load: async () => (await import('@/app/api/onboarding/[token]/launch-offers/route')).GET as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/launch-offers`,
    method: 'GET',
  },
  {
    name: 'POST /api/onboarding/[token]/launch-offers',
    bucket: 'onboarding-launch-offers',
    load: async () => (await import('@/app/api/onboarding/[token]/launch-offers/route')).POST as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/launch-offers`,
    method: 'POST',
    body: { proposalId: '11111111-1111-4111-8111-111111111111', decision: 'keep' },
  },
  {
    name: 'POST /api/onboarding/[token]/events',
    bucket: 'onboarding-events',
    load: async () => (await import('@/app/api/onboarding/[token]/events/route')).POST as unknown as Handler,
    path: `/api/onboarding/${TOKEN}/events`,
    method: 'POST',
  },
  {
    name: 'GET /api/booking/slots',
    bucket: 'booking-slots',
    load: async () => (await import('@/app/api/booking/slots/route')).GET as unknown as Handler,
    path: '/api/booking/slots?date=2026-11-20',
    method: 'GET',
  },
  {
    name: 'GET /api/presell/availability',
    bucket: 'presell-availability',
    load: async () => (await import('@/app/api/presell/availability/route')).GET as unknown as Handler,
    path: '/api/presell/availability?tenantId=t-1&menuItemId=m-1',
    method: 'GET',
  },
]

/** Called by the database through pg_net, never by a browser or a phone. */
const SERVER_CALLED: Case[] = [
  {
    name: 'POST /api/push/notify-order',
    bucket: 'notify-order',
    load: async () => (await import('@/app/api/push/notify-order/route')).POST as unknown as Handler,
    path: '/api/push/notify-order',
    method: 'POST',
  },
  {
    name: 'POST /api/push/notify-merchant',
    bucket: 'notify-merchant',
    load: async () => (await import('@/app/api/push/notify-merchant/route')).POST as unknown as Handler,
    path: '/api/push/notify-merchant',
    method: 'POST',
  },
]

function request(testCase: Case, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.method === 'GET' ? headers : { ...json, ...headers },
    ...(testCase.method === 'GET' ? {} : { body: JSON.stringify(testCase.body ?? {}) }),
  })
}

describe('address-limited routes count a request with no readable address', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
  })

  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s: no address shares one bucket and can be refused',
    async (_name, testCase) => {
      const handler = await testCase.load()

      const response = await handler(request(testCase), tokenContext)

      expect(response.status).toBe(429)
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1)
      expect(mockCheckRateLimit.mock.calls[0][0]).toBe(`${testCase.bucket}:unknown`)
    },
  )

  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s: a readable address keeps its own bucket',
    async (_name, testCase) => {
      const handler = await testCase.load()

      const response = await handler(request(testCase, { 'x-real-ip': '203.0.113.5' }), tokenContext)

      expect(response.status).toBe(429)
      expect(mockCheckRateLimit.mock.calls[0][0]).toBe(`${testCase.bucket}:203.0.113.5`)
    },
  )
})

describe('routes the database calls are not counted without an address', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
  })

  it.each(SERVER_CALLED.map((testCase) => [testCase.name, testCase] as const))(
    '%s: no address is let through uncounted, so a push is never refused for it',
    async (_name, testCase) => {
      const handler = await testCase.load()

      const response = await handler(request(testCase), tokenContext)

      // Past the limit and on to the payload check: an empty body is not a notification.
      expect(response.status).toBe(400)
      expect(mockCheckRateLimit).not.toHaveBeenCalled()
    },
  )

  it.each(SERVER_CALLED.map((testCase) => [testCase.name, testCase] as const))(
    '%s: a readable address is counted in its own bucket',
    async (_name, testCase) => {
      const handler = await testCase.load()

      const response = await handler(request(testCase, { 'x-real-ip': '203.0.113.5' }), tokenContext)

      expect(response.status).toBe(429)
      expect(mockCheckRateLimit.mock.calls[0][0]).toBe(`${testCase.bucket}:203.0.113.5`)
    },
  )
})
