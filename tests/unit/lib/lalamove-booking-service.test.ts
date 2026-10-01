/** @jest-environment node */
import type { Tenant } from '@/types/database'

const retrieve = jest.fn()
const create = jest.fn()
const createQuotation = jest.fn()
jest.mock('@lalamove/lalamove-js', () => ({
  Config: jest.fn(),
  ClientModule: jest.fn(() => ({ Quotation: { retrieve, create: createQuotation }, Order: { create } })),
  QuotationPayloadBuilder: {
    quotationPayload: () => {
      const builder = { withLanguage: () => builder, withServiceType: () => builder, withStops: () => builder, build: () => ({}) }
      return builder
    },
  },
  OrderPayloadBuilder: {
    orderPayload: () => {
      const builder = {
        withIsPODEnabled: () => builder, withQuotationID: () => builder,
        withSender: () => builder, withRecipients: () => builder,
        withMetadata: () => builder, build: () => ({}),
      }
      return builder
    },
  },
}))

const tenant = { lalamove_enabled: true, lalamove_api_key: 'pk_prod_key', lalamove_secret_key: 'sk_prod_secret', lalamove_sandbox: false } as Tenant
async function book() {
  const { createLalamoveOrder } = await import('@/lib/lalamove-service')
  return createLalamoveOrder(tenant, 'q1', 'Store', '+639170000000', 'Ana', '+639170000001')
}

beforeEach(() => {
  jest.clearAllMocks()
  retrieve.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), stops: [{ id: 'a' }, { id: 'b' }] })
  create.mockResolvedValue({ id: 'lala1', status: 'ASSIGNING_DRIVER' })
})

test('preflight failure explicitly guarantees no paid booking was attempted', async () => {
  retrieve.mockRejectedValue(new Error('Quotation expired'))
  await expect(book()).rejects.toMatchObject({ bookingMayExist: false })
  expect(create).not.toHaveBeenCalled()
})

test('transport failure after posting keeps an ambiguous booking claimed', async () => {
  create.mockRejectedValue(new Error('Connection lost'))
  await expect(book()).rejects.toMatchObject({ bookingMayExist: true })
})

test('an expired quote is rejected before posting a booking', async () => {
  retrieve.mockResolvedValue({ expiresAt: new Date(Date.now() - 1), stops: [{ id: 'a' }, { id: 'b' }] })
  await expect(book()).rejects.toMatchObject({ bookingMayExist: false })
  expect(create).not.toHaveBeenCalled()
})

test('missing provider booking ID is ambiguous rather than successful', async () => {
  create.mockResolvedValue({ status: 'ASSIGNING_DRIVER' })
  await expect(book()).rejects.toMatchObject({ bookingMayExist: true })
})

test.each([undefined, '', 'invalid', '-1'])('does not turn a missing or invalid provider fare into a free quote: %p', async total => {
  createQuotation.mockResolvedValue({ id: 'q1', priceBreakdown: { total, currency: 'PHP' }, expiresAt: new Date(Date.now() + 60_000) })
  const { createLalamoveQuotation } = await import('@/lib/lalamove-service')
  await expect(createLalamoveQuotation(tenant, 'Store', { lat: 14.6, lng: 121 }, 'Home', { lat: 14.7, lng: 121.1 }))
    .rejects.toThrow(/price/i)
})

test('a malformed stored API key is refused before Lalamove is called', async () => {
  // Lalamove answers a malformed key with a bare 502 the SDK reports as
  // "Unknown error"; the merchant needs to know the key is what to fix.
  const badTenant = { ...tenant, lalamove_api_key: 'admin123' } as Tenant
  const { createLalamoveQuotation } = await import('@/lib/lalamove-service')
  await expect(createLalamoveQuotation(badTenant, 'Store', { lat: 14.6, lng: 121 }, 'Home', { lat: 14.7, lng: 121.1 }))
    .rejects.toThrow(/API key/)
  expect(createQuotation).not.toHaveBeenCalled()
})
