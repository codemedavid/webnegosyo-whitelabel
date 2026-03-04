import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock posthog-node before importing
jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}))

describe('posthog client', () => {
  beforeEach(() => {
    jest.resetModules()
    // Clear env vars
    delete process.env.POSTHOG_API_KEY
    delete process.env.POSTHOG_HOST
  })

  test('getPostHogClient returns null when POSTHOG_API_KEY is missing', async () => {
    const { getPostHogClient } = await import('@/lib/posthog')
    const client = getPostHogClient()
    expect(client).toBeNull()
  })

  test('getPostHogClient returns a client when env vars are set', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'
    const { getPostHogClient } = await import('@/lib/posthog')
    const client = getPostHogClient()
    expect(client).not.toBeNull()
  })

  test('captureOrderCreated no-ops when client is null', async () => {
    const { captureOrderCreated } = await import('@/lib/posthog')
    // Should not throw
    await expect(
      captureOrderCreated({
        tenantId: 'tenant-1',
        tenantName: 'Test Restaurant',
        tenantSlug: 'test-restaurant',
        adminEmail: 'admin@test.com',
        orderId: 'order-1',
        customerName: 'John',
        customerContact: '09171234567',
        items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
        orderTotal: 150,
        deliveryFee: 0,
        orderType: 'pickup',
        paymentMethod: 'Cash',
        deliveryAddress: null,
      })
    ).resolves.toBeUndefined()
  })

  test('captureOrderCreated calls posthog.capture when client is available', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'

    const mockCapture = jest.fn()

    // Reset modules first, then re-mock posthog-node with our mockCapture
    jest.resetModules()
    jest.mock('posthog-node', () => ({
      PostHog: jest.fn().mockImplementation(() => ({
        capture: mockCapture,
        flush: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      })),
    }))

    const { captureOrderCreated } = await import('@/lib/posthog')
    await captureOrderCreated({
      tenantId: 'tenant-1',
      tenantName: 'Test Restaurant',
      tenantSlug: 'test-restaurant',
      adminEmail: 'admin@test.com',
      orderId: 'order-1',
      customerName: 'John',
      customerContact: '09171234567',
      items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
      orderTotal: 150,
      deliveryFee: 0,
      orderType: 'pickup',
      paymentMethod: 'Cash',
      deliveryAddress: null,
    })

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'tenant_tenant-1',
        event: 'order_created',
      })
    )
  })
})
