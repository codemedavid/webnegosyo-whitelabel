/**
 * Order tokens are minted and checked through the SERVICE ROLE.
 *
 * `public.orders` grants `anon` an INSERT policy and nothing else — no anon
 * UPDATE, no anon SELECT. On the visitor's cookie session the token UPDATE
 * therefore matched zero rows and returned NO error, so an anonymous checkout
 * got `undefined` back and the merchant's automatic Messenger message was never
 * sent; verification then failed for every anonymous caller. A token was minted
 * only when the visitor happened to also hold a merchant login in the same
 * browser. These tests pin the client, not just the crypto.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockCreateAdminClient = jest.fn()
const mockCreateCookieClient = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
jest.mock('@/lib/supabase/server', () => ({ createClient: mockCreateCookieClient }))

interface UpdateResult {
  error: { message: string } | null
  count: number | null
}

interface SelectResult {
  data: unknown
  error: unknown
}

interface FakeClient {
  client: { from: unknown }
  from: jest.Mock<(table: string) => unknown>
  update: jest.Mock<(payload: unknown, options?: unknown) => unknown>
  select: jest.Mock<(columns: unknown) => unknown>
}

function makeFakeClient(results: { update?: UpdateResult; select?: SelectResult } = {}): FakeClient {
  const update = jest.fn((payload: unknown, options?: unknown) => {
    void payload
    void options
    return { eq: () => Promise.resolve(results.update ?? { error: null, count: 1 }) }
  })

  const select = jest.fn((columns: unknown) => {
    void columns
    return {
      eq: () => ({
        single: () => Promise.resolve(results.select ?? { data: null, error: null }),
      }),
    }
  })

  const from = jest.fn((table: string) => {
    void table
    return { update, select }
  })

  return { client: { from }, from, update, select }
}

/** Install a fake as whatever `createAdminClient()` hands back. */
function installAdminFake(results: { update?: UpdateResult; select?: SelectResult } = {}): FakeClient {
  const fake = makeFakeClient(results)
  mockCreateAdminClient.mockReturnValue(fake.client)
  return fake
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('order-token', () => {
  describe('createOrderToken', () => {
    test('mints through the service role, never the visitor cookie session', async () => {
      const fake = installAdminFake()
      const { createOrderToken } = await import('@/lib/order-token')

      await createOrderToken('order-1')

      expect(mockCreateAdminClient).toHaveBeenCalled()
      expect(mockCreateCookieClient).not.toHaveBeenCalled()
      expect(fake.from).toHaveBeenCalledWith('orders')
    })

    test('generates a unique token', async () => {
      installAdminFake()
      const { createOrderToken } = await import('@/lib/order-token')

      const token1 = await createOrderToken('order-1')
      const token2 = await createOrderToken('order-1')

      expect(token1).toBeTruthy()
      expect(token2).toBeTruthy()
      expect(token1).not.toBe(token2)
      expect(token1.length).toBe(64)
    })

    test('stores token hash in database', async () => {
      const fake = installAdminFake()
      const { createOrderToken } = await import('@/lib/order-token')

      await createOrderToken('order-123')

      expect(fake.from).toHaveBeenCalledWith('orders')
      expect(fake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: expect.any(String),
          order_token_expires_at: expect.any(String),
        }),
        expect.objectContaining({ count: 'exact' })
      )
    })

    test('throws error for nonexistent order', async () => {
      installAdminFake({ update: { error: null, count: 0 } })
      const { createOrderToken } = await import('@/lib/order-token')

      await expect(createOrderToken('nonexistent-order')).rejects.toThrow(
        'Failed to create order token: Order not found'
      )
    })

    test('throws error on database error', async () => {
      installAdminFake({ update: { error: { message: 'Database error' }, count: null } })
      const { createOrderToken } = await import('@/lib/order-token')

      await expect(createOrderToken('order-1')).rejects.toThrow('Failed to create order token')
    })

    test('writes through an injected client when the caller supplies one', async () => {
      installAdminFake()
      const injected = makeFakeClient()
      const { createOrderToken } = await import('@/lib/order-token')

      await createOrderToken('order-1', injected.client as never)

      expect(injected.from).toHaveBeenCalledWith('orders')
      expect(mockCreateAdminClient).not.toHaveBeenCalled()
    })
  })

  describe('verifyOrderToken', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto')

    function validRow(token: string) {
      return {
        data: {
          order_token_hash: nodeCrypto.createHash('sha256').update(token).digest('hex'),
          order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
        },
        error: null,
      }
    }

    test('reads through the service role, never the visitor cookie session', async () => {
      const token = nodeCrypto.randomBytes(32).toString('hex')
      const fake = installAdminFake({ select: validRow(token) })
      const { verifyOrderToken } = await import('@/lib/order-token')

      const isValid = await verifyOrderToken('order-1', token)

      expect(isValid).toBe(true)
      expect(mockCreateAdminClient).toHaveBeenCalled()
      expect(mockCreateCookieClient).not.toHaveBeenCalled()
      expect(fake.from).toHaveBeenCalledWith('orders')
    })

    test('returns true for valid token', async () => {
      const token = nodeCrypto.randomBytes(32).toString('hex')
      installAdminFake({ select: validRow(token) })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', token)).toBe(true)
    })

    test('returns false for invalid token', async () => {
      installAdminFake({
        select: {
          data: {
            order_token_hash: 'wrong-hash',
            order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
          },
          error: null,
        },
      })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', 'wrong-token')).toBe(false)
    })

    test('returns false for expired token', async () => {
      installAdminFake({
        select: {
          data: {
            order_token_hash: 'some-hash',
            order_token_expires_at: new Date(Date.now() - 10000).toISOString(),
          },
          error: null,
        },
      })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', 'some-token')).toBe(false)
    })

    test('returns false for missing token field', async () => {
      installAdminFake({
        select: {
          data: {
            order_token_hash: null,
            order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
          },
          error: null,
        },
      })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', 'some-token')).toBe(false)
    })

    test('returns false for missing expiry field', async () => {
      installAdminFake({
        select: {
          data: { order_token_hash: 'some-hash', order_token_expires_at: null },
          error: null,
        },
      })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', 'some-token')).toBe(false)
    })

    test('returns false when order not found', async () => {
      installAdminFake({ select: { data: null, error: { code: 'PGRST116' } } })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('nonexistent-order', 'some-token')).toBe(false)
    })

    test('reads through an injected client when the caller supplies one', async () => {
      const token = nodeCrypto.randomBytes(32).toString('hex')
      installAdminFake()
      const injected = makeFakeClient({ select: validRow(token) })
      const { verifyOrderToken } = await import('@/lib/order-token')

      expect(await verifyOrderToken('order-1', token, injected.client as never)).toBe(true)
      expect(mockCreateAdminClient).not.toHaveBeenCalled()
    })
  })

  describe('clearOrderToken', () => {
    test('clears token hash and expiry through the service role', async () => {
      const fake = installAdminFake()
      const { clearOrderToken } = await import('@/lib/order-token')

      await clearOrderToken('order-1')

      expect(mockCreateCookieClient).not.toHaveBeenCalled()
      expect(fake.from).toHaveBeenCalledWith('orders')
      expect(fake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: null,
          order_token_expires_at: null,
        })
      )
    })
  })
})
