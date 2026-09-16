import { createHash } from 'node:crypto'
import { render, screen, waitFor } from '@testing-library/react'
import { computeChecksum, encodeOrderToQr } from '@/lib/qr-order-codec'
import { canRenderOrderQr, prepareOrderQr } from '@/lib/qr-order-capacity'
import type { PendingOrderRecord } from '@/lib/qr-pending-order'
import type { QrOrderPayloadV1 } from '@/types/qr-order'
import QrOrderPage from '@/app/[tenant]/order/qr/[clientOrderId]/page'

const mockGetPendingOrderByCid = jest.fn()
const mockGetTenantBySlugClient = jest.fn()
const mockRouterPush = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ tenant: 'test-cafe', clientOrderId: 'cid-1' }),
  useRouter: () => ({ push: mockRouterPush }),
}))

jest.mock('@/lib/qr-pending-order', () => ({
  getPendingOrderByCid: (...args: unknown[]) => mockGetPendingOrderByCid(...args),
  updatePendingStatus: jest.fn(),
  clearPendingOrder: jest.fn(),
}))

jest.mock('@/lib/tenants-client', () => ({
  getTenantBySlugClient: (...args: unknown[]) => mockGetTenantBySlugClient(...args),
}))

function incompressibleText(): string {
  return Array.from({ length: 400 }, (_, index) =>
    createHash('sha256').update(`qr-capacity-${index}`).digest('hex'),
  ).join('')
}

function payloadWithDetail(detail: string, removable: boolean): Omit<QrOrderPayloadV1, 'ck'> {
  return {
    v: 1,
    cid: 'cid-1',
    t: 1_789_530_000_000,
    tenantId: 'tenant-1',
    tenantSlug: 'test-cafe',
    orderTypeId: 'type-1',
    orderType: 'dine_in',
    customerName: 'Maria',
    customerContact: '+639171234567',
    customerData: {},
    items: [{
      menuItemId: 'item-1',
      menuItemName: 'Coffee',
      quantity: 1,
      price: 120,
      subtotal: 120,
      variationSelections: [{
        typeName: 'Size',
        optionName: 'Large',
        priceAdjustment: 20,
      }],
      ...(removable ? { variation: detail } : { specialInstructions: detail }),
    }],
    total: 120,
  }
}

function pendingRecord(payload: Omit<QrOrderPayloadV1, 'ck'>): PendingOrderRecord {
  return {
    payload: { ...payload, ck: computeChecksum(payload) },
    qrString: encodeOrderToQr(payload),
    createdAt: payload.t,
    lastStatus: 'pending',
  }
}

describe('QR pending-order page capacity recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTenantBySlugClient.mockResolvedValue({
      data: { name: 'Test Cafe' },
      error: null,
    })
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows a recoverable fallback without asking qrcode.react to render irreducible oversized data', async () => {
    const record = pendingRecord(payloadWithDetail(incompressibleText(), false))
    expect(canRenderOrderQr(record.qrString)).toBe(false)
    const { ck: checksum, ...payload } = record.payload
    expect(checksum).toHaveLength(8)
    expect(prepareOrderQr(payload).ok).toBe(false)

    mockGetPendingOrderByCid.mockReturnValue(record)
    const { container } = render(<QrOrderPage />)

    expect(await screen.findByRole('heading', {
      name: 'This order is too large for one QR code',
    })).toBeInTheDocument()
    expect(screen.getByText(/cannot be restored to your cart automatically/i)).toBeInTheDocument()
    expect(container.querySelector('svg[height="232"]')).not.toBeInTheDocument()
  })

  it('compacts an oversized cached payload and renders it with the real QR component', async () => {
    const record = pendingRecord(payloadWithDetail(incompressibleText(), true))
    expect(canRenderOrderQr(record.qrString)).toBe(false)
    const { ck: checksum, ...payload } = record.payload
    expect(checksum).toHaveLength(8)
    expect(prepareOrderQr(payload).ok).toBe(true)

    mockGetPendingOrderByCid.mockReturnValue(record)
    const { container } = render(<QrOrderPage />)

    await waitFor(() => {
      expect(container.querySelector('svg[height="232"]')).toBeInTheDocument()
    })
    expect(screen.queryByText('This order is too large for one QR code')).not.toBeInTheDocument()
  })
})
