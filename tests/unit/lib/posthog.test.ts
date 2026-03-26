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
        items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
        orderTotal: 150,
        deliveryFee: 0,
        orderType: 'pickup',
        paymentMethod: 'Cash',
        customerData: { customer_name: 'John', customer_phone: '09171234567' },
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
      items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
      orderTotal: 150,
      deliveryFee: 0,
      orderType: 'pickup',
      paymentMethod: 'Cash',
      customerData: { customer_name: 'John', customer_phone: '09171234567' },
    })

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'tenant_tenant-1',
        event: 'order_created',
      })
    )
  })

  test('captureBookingCreated no-ops when client is null', async () => {
    const { captureBookingCreated } = await import('@/lib/posthog')
    await expect(
      captureBookingCreated({
        name: 'Maria Santos',
        email: 'maria@email.com',
        phone: '+639171234567',
        bookingDate: '2026-04-01',
        bookingTime: '10:00',
        leadId: 'lead-1',
        source: 'landing_page',
      })
    ).resolves.toBeUndefined()
  })

  test('captureBookingCreated calls posthog.capture with correct event', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'

    const mockCapture = jest.fn()

    jest.resetModules()
    jest.mock('posthog-node', () => ({
      PostHog: jest.fn().mockImplementation(() => ({
        capture: mockCapture,
        flush: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      })),
    }))

    const { captureBookingCreated } = await import('@/lib/posthog')
    await captureBookingCreated({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
      leadId: 'lead-1',
      source: 'landing_page',
    })

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'lead_maria@email.com',
        event: 'booking_created',
        properties: expect.objectContaining({
          lead_id: 'lead-1',
          booking_date: '2026-04-01',
          booking_time: '10:00',
          $set: expect.objectContaining({
            email: 'maria@email.com',
            name: 'Maria Santos',
          }),
        }),
      })
    )
  })
})
