/**
 * @jest-environment node
 *
 * The upload and order-tracking routes are limited per client address. A
 * request whose address nobody could read is still counted: all such requests
 * share ONE bucket (`<scope>:unknown`), the way the other address-limited
 * routes already do, so "no address" is never "no limit".
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
]

function request(testCase: Case, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.method === 'GET' ? headers : { ...json, ...headers },
    ...(testCase.method === 'GET' ? {} : { body: '{}' }),
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
