import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
  createOrderToken,
  verifyOrderToken,
  clearOrderToken,
} from '@/lib/order-token'

// Use the global mock from jest.setup.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = (global as any).mockFrom

beforeEach(() => {
  jest.clearAllMocks()
  mockFrom.mockReset()
})

describe('order-token', () => {
  describe('createOrderToken', () => {
    test('generates a unique token', async () => {
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
          count: 1,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const token1 = await createOrderToken('order-1')

      // Reset mock for second call
      mockFrom.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
          count: 1,
        }),
      })

      const token2 = await createOrderToken('order-1')

      expect(token1).toBeTruthy()
      expect(token2).toBeTruthy()
      expect(token1).not.toBe(token2)
      expect(token1.length).toBe(64)
    })

    test('stores token hash in database', async () => {
      const mockUpdate = jest.fn().mockReturnThis()
      const chain = {
        update: mockUpdate,
        eq: jest.fn().mockResolvedValue({
          error: null,
          count: 1,
        }),
      }
      mockFrom.mockReturnValue(chain)

      await createOrderToken('order-123')

      expect(mockFrom).toHaveBeenCalledWith('orders')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: expect.any(String),
          order_token_expires_at: expect.any(String),
        }),
        expect.objectContaining({ count: 'exact' })
      )
    })

    test('throws error for nonexistent order', async () => {
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
          count: 0,
        }),
      }
      mockFrom.mockReturnValue(chain)

      await expect(createOrderToken('nonexistent-order')).rejects.toThrow(
        'Failed to create order token: Order not found'
      )
    })

    test('throws error on database error', async () => {
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Database error' },
          count: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      await expect(createOrderToken('order-1')).rejects.toThrow('Failed to create order token')
    })
  })

  describe('verifyOrderToken', () => {
    test('returns true for valid token', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require('crypto')
      const testToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(testToken).digest('hex')

      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            order_token_hash: tokenHash,
            order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('order-1', testToken)
      expect(isValid).toBe(true)
    })

    test('returns false for invalid token', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            order_token_hash: 'wrong-hash',
            order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('order-1', 'wrong-token')
      expect(isValid).toBe(false)
    })

    test('returns false for expired token', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            order_token_hash: 'some-hash',
            order_token_expires_at: new Date(Date.now() - 10000).toISOString(),
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false for missing token field', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            order_token_hash: null,
            order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false for missing expiry field', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            order_token_hash: 'some-hash',
            order_token_expires_at: null,
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false when order not found', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }
      mockFrom.mockReturnValue(chain)

      const isValid = await verifyOrderToken('nonexistent-order', 'some-token')
      expect(isValid).toBe(false)
    })
  })

  describe('clearOrderToken', () => {
    test('clears token hash and expiry', async () => {
      const mockUpdate = jest.fn().mockReturnThis()
      const chain = {
        update: mockUpdate,
        eq: jest.fn().mockResolvedValue({ error: null }),
      }
      mockFrom.mockReturnValue(chain)

      await clearOrderToken('order-1')

      expect(mockFrom).toHaveBeenCalledWith('orders')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: null,
          order_token_expires_at: null,
        })
      )
    })
  })
})
