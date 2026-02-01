import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
  createOrderToken,
  verifyOrderToken,
  clearOrderToken,
} from '@/lib/order-token'

// Use the global mock from jest.setup.js
const mockFrom = (global as any).mockFrom

beforeEach(() => {
  jest.clearAllMocks()
  // Reset the from mock
  mockFrom.mockReset()
})

describe('order-token', () => {
  describe('createOrderToken', () => {
    test('generates a unique token', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        error: null,
        count: 1,
      })
      mockFrom.mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
      })

      const token1 = await createOrderToken('order-1')
      const token2 = await createOrderToken('order-1')

      expect(token1).toBeTruthy()
      expect(token2).toBeTruthy()
      expect(token1).not.toBe(token2)
      expect(token1.length).toBe(64)
    })

    test('stores token hash in database', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        error: null,
        count: 1,
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
      })

      await createOrderToken('order-123')

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: expect.any(String),
          order_token_expires_at: expect.any(String),
        }),
        expect.objectContaining({ count: 'exact' })
      )
    })

    test('throws error for nonexistent order', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        error: null,
        count: 0,
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
      })

      await expect(createOrderToken('nonexistent-order')).rejects.toThrow(
        'Failed to create order token: Order not found'
      )
    })

    test('throws error on database error', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        error: { message: 'Database error' },
        count: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
      })

      await expect(createOrderToken('order-1')).rejects.toThrow('Failed to create order token')
    })
  })

  describe('verifyOrderToken', () => {
    test('returns true for valid token', async () => {
      const crypto = require('crypto')
      const testToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(testToken).digest('hex')

      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          order_token_hash: tokenHash,
          order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
        },
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('order-1', testToken)
      expect(isValid).toBe(true)
    })

    test('returns false for invalid token', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          order_token_hash: 'wrong-hash',
          order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
        },
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('order-1', 'wrong-token')
      expect(isValid).toBe(false)
    })

    test('returns false for expired token', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          order_token_hash: 'some-hash',
          order_token_expires_at: new Date(Date.now() - 10000).toISOString(),
        },
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false for missing token field', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          order_token_hash: null,
          order_token_expires_at: new Date(Date.now() + 10000).toISOString(),
        },
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false for missing expiry field', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          order_token_hash: 'some-hash',
          order_token_expires_at: null,
        },
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('order-1', 'some-token')
      expect(isValid).toBe(false)
    })

    test('returns false when order not found', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })
      mockSupabaseClient.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      })

      const isValid = await verifyOrderToken('nonexistent-order', 'some-token')
      expect(isValid).toBe(false)
    })
  })

  describe('clearOrderToken', () => {
    test('clears token hash and expiry', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({
        error: null,
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
      })

      await clearOrderToken('order-1')

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          order_token_hash: null,
          order_token_expires_at: null,
        })
      )
    })
  })
})
