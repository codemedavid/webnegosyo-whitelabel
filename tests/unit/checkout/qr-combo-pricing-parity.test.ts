/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { POST } from '@/app/api/orders/price-handoff/route'
import { authenticateMerchant } from '@/lib/loyalty/merchant-http'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildQrOrderItems } from '@/lib/checkout/qr-order-items'
import { calculateSlotBundleSubtotal } from '@/lib/bundle-pricing'
import { encodeOrderToQr } from '@/lib/qr-order-codec'
import { decodeQrToOrder, type QrOrderPayloadV1, type QrOrderItemV1 } from '../../../webnegosyo-app/lib/qr-order-codec'
import { qrOrderStockItems } from '../../../webnegosyo-app/lib/qr-order-stock'
import type { CartBundleItem } from '@/types/database'

jest.mock('@/lib/loyalty/merchant-http', () => ({
  ...jest.requireActual('@/lib/loyalty/merchant-http'), authenticateMerchant: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('../../../webnegosyo-app/lib/authorized-post', () => ({ getAccessTokenBounded: jest.fn(async () => 'merchant-token') }))
jest.mock('../../../webnegosyo-app/lib/web-app-url', () => ({ getWebAppUrl: () => 'https://shop.test' }))

// Exercise the real phone HTTP client without importing React Native's global
// FormData/fetch declarations into the web project's TypeScript program.
const { handoffPricingLines, priceComboHandoff } = jest.requireActual<{
  handoffPricingLines: (items: readonly QrOrderItemV1[]) => Array<Record<string, unknown>>
  priceComboHandoff: (tenantId: string, items: readonly QrOrderItemV1[], outletId: string | null) => Promise<{ items: QrOrderItemV1[]; total: number }>
}>('../../../webnegosyo-app/lib/scan-handoff-pricing')

const tenantId = '11111111-1111-4111-8111-111111111111'
const cart = (mode: 'fixed' | 'discount'): CartBundleItem => ({
  id: 'cart-combo', bundleId: 'combo', bundleName: 'Combo', quantity: 2,
  pricingType: mode, basePrice: 100.01, discountPercent: 25,
  slots: [{
    slotId: 'drink-slot', slotName: 'Drink', menuItemId: 'tea', menuItemName: 'Tea', menuItemPrice: 60,
    quantity: 3, priceOverride: 5,
    selectedAddons: [{ id: 'pearl', name: 'Pearls', price: 3, quantity: 2 }],
  }, {
    slotId: 'side-slot', slotName: 'Side', menuItemId: 'side', menuItemName: 'Side', menuItemPrice: 30,
    quantity: 1, priceOverride: 0, selectedAddons: [],
  }],
} as CartBundleItem)

function database(bundle: CartBundleItem, activeOutlet?: string) {
  const rows: Record<string, unknown> = {
    tenants: { bundles_enabled: true },
    outlets: activeOutlet ? { id: activeOutlet } : null,
    outlet_menu_items: [],
    menu_items: [
      { id: 'tea', name: 'Tea', category_id: 'drinks', price: 60, is_available: true, addons: [{ id: 'pearl', name: 'Pearls', price: 3 }] },
      { id: 'side', name: 'Side', category_id: 'sides', price: 30, is_available: true },
    ],
    bundles: [{
      id: 'combo', name: 'Combo', is_active: true, pricing_type: bundle.pricingType,
      fixed_price: 100.01, discount_percent: 25,
      slots: bundle.slots.map(slot => ({
        id: slot.slotId, name: slot.slotName, category_id: 'unused', pick_count: slot.quantity,
        included_item_ids: [slot.menuItemId],
        price_overrides: [{ menu_item_id: slot.menuItemId, price_override: slot.priceOverride }],
      })),
    }],
  }
  const filters: unknown[][] = []
  return { filters, from: (table: string) => {
    const query = {
      select: () => query, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query }, in: () => query, maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
    }
    return query
  } }
}

function scanned(bundle: CartBundleItem) {
  const payload: Omit<QrOrderPayloadV1, 'ck'> = {
    v: 1, cid: 'order-1', t: Date.now(), tenantId, tenantSlug: 'shop', orderTypeId: 'pickup',
    orderType: 'pickup', customerName: 'Ana', customerContact: '', customerData: {},
    items: buildQrOrderItems([], [bundle]), total: calculateSlotBundleSubtotal(bundle),
  }
  const decoded = decodeQrToOrder(encodeOrderToQr(payload))
  if (!decoded.ok) throw new Error('QR decode failed')
  return decoded.payload
}

beforeEach(() => {
  jest.mocked(authenticateMerchant).mockResolvedValue({
    ok: true, userId: 'cashier', member: { role: 'admin', tenant_id: tenantId, is_owner: true, permissions: [] },
  })
})
afterEach(() => jest.restoreAllMocks())

it.each(['fixed', 'discount'] as const)('keeps %s combo total and extras through encode, scan, authoritative preview and saved lines', async mode => {
  const bundle = cart(mode)
  jest.mocked(createAdminClient).mockReturnValue(database(bundle) as unknown as ReturnType<typeof createAdminClient>)
  const payload = scanned(bundle)
  if (mode === 'fixed') expect(payload.items.length).toBeGreaterThan(bundle.slots.length)
  expect(payload.items.reduce((sum, line) => sum + Math.round(line.subtotal * 100), 0)).toBe(Math.round(payload.total * 100))
  const transport = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) =>
    POST(new NextRequest(String(url), { ...init, signal: init?.signal ?? undefined })))
  const verified = await priceComboHandoff(tenantId, payload.items, null)
  const accepted = verified.items
  expect(transport).toHaveBeenCalledWith('https://shop.test/api/orders/price-handoff', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer merchant-token' }),
  }))
  expect(verified.total).toBe(payload.total)
  expect(accepted.reduce((sum, line) => sum + Math.round(line.price * line.quantity * 100), 0)).toBe(Math.round(payload.total * 100))
  expect(accepted.reduce((sum, line) => sum + line.quantity, 0)).toBe(8)
  const stock = qrOrderStockItems(accepted, {})
  expect(stock.filter(line => line.menuItemId === 'tea').every(line => line.addonIds?.includes('pearl') && line.addonQuantities?.pearl === 2)).toBe(true)
})

it('refuses old or forged bundle markers without complete combo provenance', async () => {
  const bundle = cart('fixed')
  jest.mocked(createAdminClient).mockReturnValue(database(bundle) as unknown as ReturnType<typeof createAdminClient>)
  const payload = scanned(bundle)
  const items = handoffPricingLines(payload.items).map(line => ({ ...line, bundleSlotId: undefined }))
  const response = await POST(new NextRequest('https://shop.test/api/orders/price-handoff', {
    method: 'POST', body: JSON.stringify({ tenantId, items }),
  }))
  expect(response.status).toBe(422)
})

it('does not load catalog data when merchant authorization fails', async () => {
  jest.mocked(createAdminClient).mockClear()
  jest.mocked(authenticateMerchant).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) })
  const response = await POST(new NextRequest('https://shop.test/api/orders/price-handoff', {
    method: 'POST', body: JSON.stringify({ tenantId, items: [] }),
  }))
  expect(response.status).toBe(403)
  expect(createAdminClient).not.toHaveBeenCalled()
})

const branchA = '22222222-2222-4222-8222-222222222222'
const branchB = '33333333-3333-4333-8333-333333333333'
const pricingRequest = (outletId?: string) => new NextRequest('https://shop.test/api/orders/price-handoff', {
  method: 'POST', body: JSON.stringify({ tenantId, items: handoffPricingLines(scanned(cart('fixed')).items), outletId }),
})

it('refuses a branch cashier trying to price another branch', async () => {
  jest.mocked(createAdminClient).mockClear()
  jest.mocked(authenticateMerchant).mockResolvedValue({ ok: true, userId: 'staff', member: {
    role: 'admin', tenant_id: tenantId, is_owner: false, outlet_id: branchA, permissions: ['orders'],
  } })
  expect((await POST(pricingRequest(branchB))).status).toBe(403)
  expect(createAdminClient).not.toHaveBeenCalled()
})

it('uses the cashier’s pinned branch when the request omits it', async () => {
  jest.mocked(authenticateMerchant).mockResolvedValue({ ok: true, userId: 'staff', member: {
    role: 'admin', tenant_id: tenantId, is_owner: false, outlet_id: branchA, permissions: ['orders'],
  } })
  const db = database(cart('fixed'), branchA)
  jest.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
  expect((await POST(pricingRequest())).status).toBe(200)
  expect(db.filters).toEqual(expect.arrayContaining([
    ['outlets', 'tenant_id', tenantId], ['outlets', 'id', branchA], ['outlets', 'is_active', true],
    ['outlet_menu_items', 'outlet_id', branchA],
  ]))
})

it('refuses an unknown, inactive or foreign branch even for a store owner', async () => {
  jest.mocked(createAdminClient).mockReturnValue(database(cart('fixed')) as unknown as ReturnType<typeof createAdminClient>)
  expect((await POST(pricingRequest(branchB))).status).toBe(422)
})

it('requires an orders or POS permission', async () => {
  jest.mocked(authenticateMerchant).mockResolvedValue({ ok: true, userId: 'staff', member: {
    role: 'admin', tenant_id: tenantId, is_owner: false, permissions: ['menu'],
  } })
  expect((await POST(pricingRequest())).status).toBe(403)
})
