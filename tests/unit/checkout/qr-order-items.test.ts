import { buildInventorySelections, buildQrOrderItems } from '@/lib/checkout/qr-order-items'
import type { CartBundleItem, CartItem } from '@/types/database'

const plainItem = {
  id: 'line-1',
  menu_item: { id: 'adobo', name: 'Adobo', price: 150 },
  selected_addons: [],
  quantity: 2,
  subtotal: 300,
} as unknown as CartItem

const configuredItem = {
  id: 'line-2',
  menu_item: { id: 'silog', name: 'Tapsilog', price: 120 },
  selected_variations: {
    size: { id: 'opt-large', name: 'Large', price_modifier: 30 },
    spice: { id: 'opt-hot', name: 'Hot', price_modifier: 0 },
  },
  selected_addons: [{ id: 'addon-egg', name: 'Egg', price: 15, quantity: 2 }],
  special_instructions: 'no onions',
  upsellSource: 'post_add',
  quantity: 1,
  subtotal: 180,
} as unknown as CartItem

const bundle = {
  id: 'bundle-line',
  bundleId: 'combo-1',
  bundleName: 'Family Combo',
  quantity: 2,
  pricingType: 'fixed',
  basePrice: 100,
  slots: [
    {
      slotName: 'Drink',
      slotId: 'drink-slot',
      menuItemPrice: 40,
      menuItemId: 'iced-tea',
      menuItemName: 'Iced Tea',
      priceOverride: 40,
      quantity: 1,
      selectedVariation: { id: 'opt-big', name: 'Big', price_modifier: 10 },
      selectedAddons: [{ id: 'addon-pearl', name: 'Pearls', price: 5 }],
    },
  ],
} as unknown as CartBundleItem

describe('buildQrOrderItems', () => {
  it('omits every optional key a plain line does not have', () => {
    expect(buildQrOrderItems([plainItem], [])).toEqual([
      { menuItemId: 'adobo', menuItemName: 'Adobo', quantity: 2, price: 150, basePrice: 150, subtotal: 300, optionIds: [], addonIds: [] },
    ])
  })

  it('prices a configured line per unit INCLUDING variations and add-ons', () => {
    const [line] = buildQrOrderItems([configuredItem], [])

    expect(line).toEqual({
      menuItemId: 'silog',
      menuItemName: 'Tapsilog',
      quantity: 1,
      price: 180, // 120 + 30 (Large) + 0 (Hot) + 15 × 2 (Egg)
      basePrice: 120,
      subtotal: 180,
      optionIds: ['opt-large', 'opt-hot'],
      addonIds: ['addon-egg'],
      addonQuantities: { 'addon-egg': 2 },
      variation: 'Large, Hot',
      variationSelections: [
        { typeName: 'Variation', optionName: 'Large', priceAdjustment: 30 },
        { typeName: 'Variation', optionName: 'Hot', priceAdjustment: 0 },
      ],
      addons: [{ name: 'Egg', price: 15, quantity: 2 }],
      specialInstructions: 'no onions',
      isUpsellItem: true,
    })
  })

  it('flattens a bundle slot, multiplying by the bundle quantity', () => {
    const [line] = buildQrOrderItems([], [bundle])

    expect(line).toEqual({
      menuItemId: 'iced-tea',
      menuItemName: 'Iced Tea',
      quantity: 2,
      basePrice: 40,
      price: 155, // 100 combo base + 40 surcharge + 10 Big + 5 Pearls
      subtotal: 310,
      variation: 'Big',
      variationSelections: [{ typeName: 'Variation', optionName: 'Big', priceAdjustment: 10 }],
      addons: [{ name: 'Pearls', price: 5, quantity: 1 }],
      isBundleItem: true,
      bundleId: 'combo-1',
      bundleName: 'Family Combo',
      slotName: 'Drink',
      bundleCartId: 'bundle-line', bundleSlotId: 'drink-slot', bundleQuantity: 2,
      optionIds: ['opt-big'], addonIds: ['addon-pearl'],
    })
  })

  it('lists cart lines before bundle slots', () => {
    const lines = buildQrOrderItems([plainItem], [bundle])

    expect(lines.map((line) => line.menuItemId)).toEqual(['adobo', 'iced-tea'])
  })
})

describe('buildInventorySelections', () => {
  it('keeps option and add-on ids for cart lines and bundle slots', () => {
    const selections = buildInventorySelections([configuredItem], [bundle])

    expect(selections).toEqual([
      expect.objectContaining({ menu_item_id: 'silog', quantity: 1, addon_ids: ['addon-egg'] }),
      expect.objectContaining({ menu_item_id: 'iced-tea', quantity: 2, addon_ids: ['addon-pearl'] }),
    ])
    expect(selections[0].option_ids).toEqual(expect.arrayContaining(['opt-large', 'opt-hot']))
  })
})
