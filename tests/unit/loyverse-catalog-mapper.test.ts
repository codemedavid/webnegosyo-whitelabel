import { mapLoyverseCatalog } from '@/lib/loyverse/catalog-mapper'
import type { LoyverseCatalogInput } from '@/lib/loyverse/catalog-mapper'

const STORE = 'store_1'

function baseInput(overrides: Partial<LoyverseCatalogInput> = {}): LoyverseCatalogInput {
  return {
    storeId: STORE,
    categories: [{ id: 'cat_1', name: 'Drinks' }],
    modifiers: [],
    items: [],
    ...overrides,
  }
}

function simpleItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item_1',
    item_name: 'Americano',
    description: 'Black coffee',
    category_id: 'cat_1',
    image_url: 'https://img/americano.png',
    modifiers_ids: [],
    variants: [
      {
        variant_id: 'var_1',
        item_id: 'item_1',
        sku: '10001',
        default_pricing_type: 'FIXED',
        default_price: 100,
        stores: [{ store_id: STORE, pricing_type: 'FIXED', price: 120, available_for_sale: true }],
      },
    ],
    ...overrides,
  }
}

describe('mapLoyverseCatalog — simple items', () => {
  it('maps a single-variant item using the per-store price over the default', () => {
    const { items, warnings } = mapLoyverseCatalog(baseInput({ items: [simpleItem()] }))

    expect(warnings).toEqual([])
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.name).toBe('Americano')
    expect(item.price).toBe(120)
    expect(item.categoryLoyverseId).toBe('cat_1')
    expect(item.imageUrl).toBe('https://img/americano.png')
    expect(item.modifierGroups).toEqual([])
    expect(item.isAvailable).toBe(true)
    expect(item.mapRows).toEqual([
      expect.objectContaining({
        kind: 'variant',
        local_key: '',
        loyverse_item_id: 'item_1',
        loyverse_variant_id: 'var_1',
        loyverse_sku: '10001',
      }),
    ])
  })

  it('falls back to default_price when the store has no override', () => {
    const item = simpleItem()
    item.variants[0].stores = []
    const { items } = mapLoyverseCatalog(baseInput({ items: [item] }))
    expect(items[0].price).toBe(100)
  })

  it('marks the item unavailable when the store flags it not for sale', () => {
    const item = simpleItem()
    item.variants[0].stores[0].available_for_sale = false
    const { items } = mapLoyverseCatalog(baseInput({ items: [item] }))
    expect(items[0].isAvailable).toBe(false)
  })
})

describe('mapLoyverseCatalog — variant option axes', () => {
  it('maps one option axis to a required single-select group with deltas off the cheapest variant', () => {
    const item = simpleItem({
      option1_name: 'Size',
      variants: [
        {
          variant_id: 'var_s',
          item_id: 'item_1',
          option1_value: 'Small',
          default_pricing_type: 'FIXED',
          default_price: 100,
          stores: [],
        },
        {
          variant_id: 'var_l',
          item_id: 'item_1',
          option1_value: 'Large',
          default_pricing_type: 'FIXED',
          default_price: 140,
          stores: [],
        },
      ],
    })

    const { items, warnings } = mapLoyverseCatalog(baseInput({ items: [item] }))

    expect(warnings).toEqual([])
    const mapped = items[0]
    expect(mapped.price).toBe(100) // base = cheapest variant
    expect(mapped.modifierGroups).toHaveLength(1)
    const group = mapped.modifierGroups[0]
    expect(group.name).toBe('Size')
    expect(group.min_select).toBe(1)
    expect(group.max_select).toBe(1)
    expect(group.options.map((o) => [o.name, o.price_modifier])).toEqual([
      ['Small', 0],
      ['Large', 40],
    ])
    // Deterministic option ids so re-syncs do not rewrite the menu JSON
    expect(group.options[0].id).toBe('lv-var_s')
    // Every variant is mapped by its option id
    expect(mapped.mapRows.map((r) => [r.local_key, r.loyverse_variant_id])).toEqual([
      ['lv-var_s', 'var_s'],
      ['lv-var_l', 'var_l'],
    ])
  })

  it('collapses 2+ option axes into one exact combined group', () => {
    const item = simpleItem({
      option1_name: 'Size',
      option2_name: 'Milk',
      variants: [
        {
          variant_id: 'v1',
          item_id: 'item_1',
          option1_value: 'Small',
          option2_value: 'Dairy',
          default_pricing_type: 'FIXED',
          default_price: 100,
          stores: [],
        },
        {
          variant_id: 'v2',
          item_id: 'item_1',
          option1_value: 'Large',
          option2_value: 'Oat',
          default_pricing_type: 'FIXED',
          default_price: 165,
          stores: [],
        },
      ],
    })

    const { items } = mapLoyverseCatalog(baseInput({ items: [item] }))
    const group = items[0].modifierGroups[0]
    expect(group.name).toBe('Size / Milk')
    expect(group.options.map((o) => [o.name, o.price_modifier])).toEqual([
      ['Small / Dairy', 0],
      ['Large / Oat', 65],
    ])
  })
})

describe('mapLoyverseCatalog — Loyverse modifiers', () => {
  it('maps referenced modifiers to optional multi-select groups', () => {
    const input = baseInput({
      modifiers: [
        {
          id: 'mod_1',
          name: 'Extras',
          position: 1,
          modifier_options: [
            { id: 'opt_1', name: 'Extra shot', price: 30, position: 1 },
            { id: 'opt_2', name: 'Whipped cream', price: 20, position: 2 },
          ],
        },
      ],
      items: [simpleItem({ modifiers_ids: ['mod_1'] })],
    })

    const { items } = mapLoyverseCatalog(input)
    const groups = items[0].modifierGroups
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Extras')
    expect(groups[0].min_select).toBe(0)
    expect(groups[0].max_select).toBeNull()
    expect(groups[0].options.map((o) => [o.id, o.name, o.price_modifier])).toEqual([
      ['lvm-opt_1', 'Extra shot', 30],
      ['lvm-opt_2', 'Whipped cream', 20],
    ])
    // Modifier options get their own map rows for receipt-line building later
    expect(items[0].mapRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'modifier_option',
          local_key: 'lvm-opt_1',
          loyverse_modifier_id: 'mod_1',
          loyverse_modifier_option_id: 'opt_1',
        }),
      ])
    )
  })
})

describe('mapLoyverseCatalog — stock-aware availability', () => {
  it('86es a tracked item whose only variant has zero stock at the store', () => {
    const { items } = mapLoyverseCatalog(
      baseInput({
        items: [simpleItem({ track_stock: true })],
        inventoryLevels: [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      })
    )
    expect(items[0].isAvailable).toBe(false)
  })

  it('keeps a tracked item orderable while stock remains', () => {
    const { items } = mapLoyverseCatalog(
      baseInput({
        items: [simpleItem({ track_stock: true })],
        inventoryLevels: [{ variant_id: 'var_1', store_id: STORE, in_stock: 7 }],
      })
    )
    expect(items[0].isAvailable).toBe(true)
  })

  it('never 86es an untracked item from stock levels', () => {
    const { items } = mapLoyverseCatalog(
      baseInput({
        items: [simpleItem({ track_stock: false })],
        inventoryLevels: [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      })
    )
    expect(items[0].isAvailable).toBe(true)
  })

  it('treats a tracked variant with no reported level as in stock', () => {
    const { items } = mapLoyverseCatalog(
      baseInput({ items: [simpleItem({ track_stock: true })], inventoryLevels: [] })
    )
    expect(items[0].isAvailable).toBe(true)
  })

  it('ignores stock levels from other stores', () => {
    const { items } = mapLoyverseCatalog(
      baseInput({
        items: [simpleItem({ track_stock: true })],
        inventoryLevels: [{ variant_id: 'var_1', store_id: 'other', in_stock: 0 }],
      })
    )
    expect(items[0].isAvailable).toBe(true)
  })

  it('86es a multi-variant tracked item only when every variant is out', () => {
    const item = simpleItem({
      track_stock: true,
      option1_name: 'Size',
      variants: [
        { variant_id: 'var_s', item_id: 'item_1', option1_value: 'Small', default_pricing_type: 'FIXED', default_price: 100, stores: [] },
        { variant_id: 'var_l', item_id: 'item_1', option1_value: 'Large', default_pricing_type: 'FIXED', default_price: 140, stores: [] },
      ],
    })

    const oneOut = mapLoyverseCatalog(
      baseInput({
        items: [item],
        inventoryLevels: [{ variant_id: 'var_s', store_id: STORE, in_stock: 0 }],
      })
    )
    expect(oneOut.items[0].isAvailable).toBe(true)

    const bothOut = mapLoyverseCatalog(
      baseInput({
        items: [item],
        inventoryLevels: [
          { variant_id: 'var_s', store_id: STORE, in_stock: 0 },
          { variant_id: 'var_l', store_id: STORE, in_stock: -2 },
        ],
      })
    )
    expect(bothOut.items[0].isAvailable).toBe(false)
  })
})

describe('mapLoyverseCatalog — unmappable items', () => {
  it('skips sold-by-weight items with a warning', () => {
    const { items, warnings } = mapLoyverseCatalog(
      baseInput({ items: [simpleItem({ sold_by_weight: true })] })
    )
    expect(items).toEqual([])
    expect(warnings.join(' ')).toMatch(/Americano.*weight/i)
  })

  it('skips variable-priced items with a warning', () => {
    const item = simpleItem()
    item.variants[0].default_pricing_type = 'VARIABLE'
    item.variants[0].stores = []
    const { items, warnings } = mapLoyverseCatalog(baseInput({ items: [item] }))
    expect(items).toEqual([])
    expect(warnings.join(' ')).toMatch(/Americano.*variable/i)
  })

  it('skips deleted items silently', () => {
    const { items, warnings } = mapLoyverseCatalog(
      baseInput({ items: [simpleItem({ deleted_at: '2026-01-01T00:00:00Z' })] })
    )
    expect(items).toEqual([])
    expect(warnings).toEqual([])
  })
})
