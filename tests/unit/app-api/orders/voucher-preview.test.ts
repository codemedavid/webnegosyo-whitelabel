import { appVoucherPreviewSchema } from '@/lib/app-contract'
import { CODE_NOT_VALID, DELIVERY_CODE_LATER, previewAppVoucher, type VoucherPreviewDeps } from '@/lib/app-api/orders/voucher-preview'
import type { DraftTenant } from '@/lib/app-api/orders/load-draft'
import type { Voucher } from '@/lib/vouchers/types'
import type { Category, MenuItem } from '@/types/database'
import { CUSTOMER, DELIVERY_TYPE, DISH, LARGE, PICKUP_TYPE, SIZE_GROUP, TENANT, draft } from './order-fixtures'

jest.mock('server-only', () => ({}))

const TENANT_ROW: DraftTenant = { id: TENANT, row: { id: TENANT }, backend: 'platform', isLalamove: false, isMultiBranch: false, modifierGroupsEnabled: false }
const DISH_ROW = {
  id: DISH,
  tenant_id: TENANT,
  category_id: 'cat-1',
  name: 'Iced Latte',
  price: 120,
  is_available: true,
  variations: [],
  addons: [],
  variation_types: [{ id: SIZE_GROUP, name: 'Size', is_required: true, options: [{ id: LARGE, name: 'Large', price_modifier: 10 }] }],
} as unknown as MenuItem

const VOUCHER: Voucher = {
  id: 'v-1',
  code: 'SAVE10',
  name: '10% off drinks',
  discountType: 'percent',
  discountValue: 10,
  scope: 'order',
  isStackable: true,
  usedCount: 0,
  channels: ['checkout'],
  isActive: true,
} as unknown as Voucher

const REQUEST = { code: ' save10 ', orderTypeId: PICKUP_TYPE, outletId: null, lines: draft().lines }

function deps(overrides: Partial<VoucherPreviewDeps> = {}, found: Voucher[] = [VOUCHER]) {
  const priceVouchers = jest.fn(async (input: Parameters<VoucherPreviewDeps['priceVouchers']>[0]) => {
    const vouchers = await input.lookup!.findByCodes(TENANT, ['SAVE10'])
    const voucher = vouchers[0]
    return {
      application: {
        applied: voucher ? [{ voucher, result: { amount: 26 } }] : [],
        rejected: voucher ? [] : [{ voucherId: '', code: 'SAVE10', reason: 'not_found', message: 'nope' }],
      },
    } as never
  })
  return {
    readTenant: jest.fn().mockResolvedValue(TENANT_ROW),
    loadDraft: jest.fn(async (_tenant: DraftTenant, request: { lines: ReturnType<typeof draft>['lines'] }) => ({
      ok: true as const,
      outlet: null,
      input: { lines: request.lines, menuItems: new Map([[DISH, DISH_ROW]]), categories: [{ id: 'cat-1', is_active: true } as unknown as Category], tenant: { id: TENANT }, branchIndex: new Map(), outletId: null },
    })),
    readOrderTypes: jest.fn().mockResolvedValue([
      { id: PICKUP_TYPE, type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true, service_charge_enabled: true, service_charge_type: 'percentage', service_charge_value: 10 },
      { id: DELIVERY_TYPE, type: 'delivery', name: 'Delivery', is_enabled: true, available_on_web: true },
    ]),
    readProfile: jest.fn().mockResolvedValue({ name: 'Ana', phoneE164: '+639171234567' }),
    priceLines: jest.fn(async (_tenant, lines) => ({ ok: true as const, lines: lines.map((line: object) => ({ ...line, price: 130, subtotal: 260 })), itemsSubtotal: 260 })),
    priceVouchers,
    voucherLookup: () => ({ findByCodes: jest.fn().mockResolvedValue(found), countCustomerRedemptions: jest.fn().mockResolvedValue({}) }),
    ...overrides,
  }
}

const preview = (d: VoucherPreviewDeps, request = REQUEST) => previewAppVoucher({ tenantId: TENANT, customerId: CUSTOMER, request }, d)

describe('previewAppVoucher', () => {
  it('prices the code against the server-priced bag through the engine’s voucher step', async () => {
    // Arrange
    const d = deps()

    // Act
    const outcome = await preview(d)

    // Assert
    expect(outcome.ok && appVoucherPreviewSchema.parse(outcome.data)).toEqual({ code: 'SAVE10', label: '10% off drinks', isApplied: true, discount: 26, reason: null })
    const priced = (d.priceVouchers as jest.Mock).mock.calls[0][0]
    expect(priced).toMatchObject({ tenantId: TENANT, voucherCodes: [' save10 '], deliveryFee: undefined, serviceCharge: 26, outletId: null, customerKey: '+639171234567' })
    expect(priced.items).toEqual([expect.objectContaining({ menu_item_id: DISH, subtotal: 260, option_ids: [LARGE] })])
  })

  it('an unknown code is not found', async () => {
    expect(await preview(deps({}, []))).toEqual({ ok: false, code: 'not_found', message: CODE_NOT_VALID })
  })

  it('an inactive code is not found', async () => {
    expect(await preview(deps({}, [{ ...VOUCHER, isActive: false }]))).toEqual({ ok: false, code: 'not_found', message: CODE_NOT_VALID })
  })

  it('a code that does not apply yet answers the engine’s own reason', async () => {
    const d = deps({
      priceVouchers: jest.fn(async (input) => {
        await input.lookup!.findByCodes(TENANT, ['SAVE10'])
        return { application: { applied: [], rejected: [{ voucherId: 'v-1', code: 'SAVE10', reason: 'below_minimum', message: 'Add ₱40 more to use this code.' }] } } as never
      }),
    })
    expect(await preview(d)).toEqual({ ok: true, status: 200, data: { code: 'SAVE10', label: '10% off drinks', isApplied: false, discount: 0, reason: 'Add ₱40 more to use this code.' } })
  })

  it('a free-delivery code on a delivery order explains it comes off at checkout', async () => {
    const d = deps({
      priceVouchers: jest.fn(async (input) => {
        await input.lookup!.findByCodes(TENANT, ['SAVE10'])
        return { application: { applied: [], rejected: [{ voucherId: 'v-1', code: 'SAVE10', reason: 'no_delivery_fee', message: 'No delivery fee.' }] } } as never
      }),
    })
    const outcome = await preview(d, { ...REQUEST, orderTypeId: DELIVERY_TYPE })
    expect(outcome.ok && outcome.data.reason).toBe(DELIVERY_CODE_LATER)
  })

  it('refuses a bag the menu no longer allows, before pricing any code', async () => {
    const d = deps()
    const outcome = await preview(d, { ...REQUEST, lines: [{ itemId: 'gone', quantity: 1, selections: {} }] })
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.code).toBe('refused')
    expect(d.priceVouchers).not.toHaveBeenCalled()
  })

  it('signed-out and unpriceable bags answer like the order would', async () => {
    expect((await preview(deps({ readProfile: jest.fn().mockResolvedValue(null) }))).ok).toBe(false)
    const outcome = await preview(deps({ priceLines: jest.fn().mockResolvedValue({ ok: false, refused: false, error: 'db' }) }))
    expect(!outcome.ok && outcome.code).toBe('unavailable')
  })
})
