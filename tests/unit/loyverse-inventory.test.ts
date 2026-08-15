import { partitionAvailabilityChanges } from '@/lib/loyverse/inventory-sync'

const STORE = 'store_1'

const mapRows = [
  // Single-variant item: the base variant IS the dish.
  { kind: 'variant', local_key: '', menu_item_id: 'mi-1', loyverse_variant_id: 'var_1' },
  // Multi-variant item: two variants of the same dish.
  { kind: 'variant', local_key: 'lv-var_s', menu_item_id: 'mi-2', loyverse_variant_id: 'var_s' },
  { kind: 'variant', local_key: 'lv-var_l', menu_item_id: 'mi-2', loyverse_variant_id: 'var_l' },
  // Modifier options never drive item availability.
  { kind: 'modifier_option', local_key: 'lvm-o1', menu_item_id: null, loyverse_variant_id: null },
] as const

describe('partitionAvailabilityChanges', () => {
  it('86es a single-variant item when its stock hits zero at the mapped store', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )
    expect(result.makeUnavailable).toEqual(['mi-1'])
    expect(result.makeAvailable).toEqual([])
  })

  it('restores the item when stock comes back', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 5 }],
      STORE,
      mapRows
    )
    expect(result.makeAvailable).toEqual(['mi-1'])
    expect(result.makeUnavailable).toEqual([])
  })

  it('ignores levels from other stores', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_1', store_id: 'other-store', in_stock: 0 }],
      STORE,
      mapRows
    )
    expect(result.makeUnavailable).toEqual([])
    expect(result.makeAvailable).toEqual([])
  })

  it('only 86es a multi-variant item when EVERY updated variant is out', () => {
    // One of two variants out → the dish is still orderable in the other size.
    const partial = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )
    expect(partial.makeUnavailable).toEqual([])

    const both = partitionAvailabilityChanges(
      [
        { variant_id: 'var_s', store_id: STORE, in_stock: 0 },
        { variant_id: 'var_l', store_id: STORE, in_stock: 0 },
      ],
      STORE,
      mapRows
    )
    expect(both.makeUnavailable).toEqual(['mi-2'])
  })

  it('any variant back in stock restores the multi-variant item', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 3 }],
      STORE,
      mapRows
    )
    expect(result.makeAvailable).toEqual(['mi-2'])
  })

  it('ignores unmapped variants', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_unknown', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )
    expect(result.makeUnavailable).toEqual([])
    expect(result.makeAvailable).toEqual([])
  })
})
