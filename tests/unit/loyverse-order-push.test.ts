import { buildLoyverseReceipt } from '@/lib/loyverse/order-push'
import type { LoyverseReceiptCatalog } from '@/lib/loyverse/order-push'
import type { OrderItem } from '@/types/database'

const config = {
  accessToken: 'tok',
  storeId: 'store_1',
  paymentTypeId: 'pay_1',
  pushMode: 'on_confirm' as const,
}

function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    menu_item_id: 'mi-1',
    menu_item_name: 'Americano',
    addons: [],
    quantity: 2,
    price: 120,
    subtotal: 240,
    ...overrides,
  }
}

const simpleCatalog: LoyverseReceiptCatalog = {
  'mi-1': { baseVariantId: 'var_1', modifierGroups: [] },
}

describe('buildLoyverseReceipt', () => {
  it('builds a receipt line from the base variant with quantity and unit price', () => {
    const { receipt, unmapped } = buildLoyverseReceipt(config, {
      orderNumber: '#42',
      items: [orderItem()],
    }, simpleCatalog)

    expect(unmapped).toEqual([])
    expect(receipt.store_id).toBe('store_1')
    expect(receipt.order).toBe('#42')
    expect(receipt.payments).toEqual([{ payment_type_id: 'pay_1' }])
    expect(receipt.line_items).toEqual([
      { variant_id: 'var_1', quantity: 2, price: 120 },
    ])
  })

  it('resolves a selected variation to its Loyverse variant via the lv- option id', () => {
    const catalog: LoyverseReceiptCatalog = {
      'mi-1': {
        baseVariantId: 'var_s',
        modifierGroups: [
          {
            id: 'lv-group-item_1',
            name: 'Size',
            display_order: 0,
            min_select: 1,
            max_select: 1,
            options: [
              { id: 'lv-var_s', name: 'Small', price_modifier: 0, display_order: 0 },
              { id: 'lv-var_l', name: 'Large', price_modifier: 40, display_order: 1 },
            ],
          },
        ],
      },
    }

    const { receipt, unmapped } = buildLoyverseReceipt(config, {
      orderNumber: '#43',
      items: [orderItem({ variations: { Size: 'Large' }, price: 160, subtotal: 320 })],
    }, catalog)

    expect(unmapped).toEqual([])
    expect(receipt.line_items[0]).toEqual({ variant_id: 'var_l', quantity: 2, price: 160 })
  })

  it('attaches lvm- addon selections as line modifiers', () => {
    const catalog: LoyverseReceiptCatalog = {
      'mi-1': {
        baseVariantId: 'var_1',
        modifierGroups: [
          {
            id: 'lvm-group-mod_1',
            name: 'Extras',
            display_order: 0,
            min_select: 0,
            max_select: null,
            options: [
              { id: 'lvm-opt_1', name: 'Extra shot', price_modifier: 30, display_order: 0 },
            ],
          },
        ],
      },
    }

    const { receipt } = buildLoyverseReceipt(config, {
      orderNumber: '#44',
      items: [orderItem({ addons: ['Extra shot'] })],
    }, catalog)

    expect(receipt.line_items[0].line_modifiers).toEqual([
      { modifier_option_id: 'opt_1' },
    ])
  })

  it('collects unmappable items instead of failing the whole receipt', () => {
    const { receipt, unmapped } = buildLoyverseReceipt(config, {
      orderNumber: '#45',
      items: [
        orderItem(),
        orderItem({ menu_item_id: 'mi-unknown', menu_item_name: 'Local-only special' }),
      ],
    }, simpleCatalog)

    expect(receipt.line_items).toHaveLength(1)
    expect(unmapped).toEqual(['Local-only special'])
    expect(receipt.note).toMatch(/Local-only special/)
  })

  // Loyverse rejects a receipt without `payments` outright:
  //   MISSING_REQUIRED_PARAMETER "Field must be set" field=object.payments
  // Every receipt this builder produces is POSTed, so every receipt must carry
  // one. Config resolution is what guarantees a payment type exists — see
  // loyverse-config.test.ts.
  it('always carries a payments line, because Loyverse requires the field', () => {
    const { receipt } = buildLoyverseReceipt(
      config,
      { orderNumber: '#46', items: [orderItem()] },
      simpleCatalog
    )
    expect(receipt.payments).toEqual([{ payment_type_id: 'pay_1' }])
  })

  it('carries special instructions as a line note', () => {
    const { receipt } = buildLoyverseReceipt(config, {
      orderNumber: '#47',
      items: [orderItem({ special_instructions: 'No sugar' })],
    }, simpleCatalog)
    expect(receipt.line_items[0].line_note).toBe('No sugar')
  })

  it('returns no receipt when nothing on the order is mapped', () => {
    const { receipt, unmapped } = buildLoyverseReceipt(config, {
      orderNumber: '#48',
      items: [orderItem({ menu_item_id: 'mi-unknown' })],
    }, {})
    expect(receipt.line_items).toHaveLength(0)
    expect(unmapped).toHaveLength(1)
  })
})
