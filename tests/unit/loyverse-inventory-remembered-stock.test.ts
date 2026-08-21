/**
 * Multi-variant dishes must go out of stock when their LAST variant sells out.
 *
 * The live failure this reproduces: Loyverse sends `inventory_levels.update`
 * as one delta per variant. The old decision compared that single-variant
 * batch against every mapped variant of the dish, so
 * `allVariants.every(v => outVariants.has(v))` could only be true if one
 * webhook happened to carry every variant at once. A two-size dish selling
 * out its last size therefore stayed orderable forever.
 *
 * The fix is remembered state, not a narrower window: `loyverse_item_map`
 * carries each variant's last known level, and the batch is merged over it.
 * Narrowing to "every variant in THIS batch" would be wrong in the other
 * direction — it would 86 a dish the moment one size ran out while another
 * was still stocked.
 *
 * Unknown (never reported / untracked by Loyverse) must always read as
 * available: a dish stuck invisible is a worse failure than one oversold.
 */

import { partitionAvailabilityChanges } from '@/lib/loyverse/inventory-sync'

const STORE = 'store_1'

/** Two sizes of one dish, plus a single-variant dish. */
const rows = (small: number | null, large: number | null) =>
  [
    { kind: 'variant', local_key: '', menu_item_id: 'mi-1', loyverse_variant_id: 'var_1', in_stock: null },
    {
      kind: 'variant',
      local_key: 'lv-var_s',
      menu_item_id: 'mi-2',
      loyverse_variant_id: 'var_s',
      in_stock: small,
    },
    {
      kind: 'variant',
      local_key: 'lv-var_l',
      menu_item_id: 'mi-2',
      loyverse_variant_id: 'var_l',
      in_stock: large,
    },
  ] as const

describe('partitionAvailabilityChanges — remembered per-variant stock', () => {
  it('86es the dish when the last variant sells out in its own single-variant webhook', () => {
    // Large already known dry; this delta empties Small. One delta per
    // variant is how Loyverse actually reports, so this is the common case.
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 0 }],
      STORE,
      rows(5, 0)
    )

    expect(result.makeUnavailable).toEqual(['mi-2'])
  })

  it('keeps the dish orderable while another variant is known to be in stock', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 0 }],
      STORE,
      rows(5, 4)
    )

    expect(result.makeUnavailable).toEqual([])
  })

  it('treats a variant with unknown stock as available rather than out', () => {
    // Large has never been reported. Out-of-stock must not be inferred from
    // absence of information.
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 0 }],
      STORE,
      rows(5, null)
    )

    expect(result.makeUnavailable).toEqual([])
  })

  it('lets the incoming batch override stale remembered stock', () => {
    // Both remembered dry, but this delta restocks Small.
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 12 }],
      STORE,
      rows(0, 0)
    )

    expect(result.makeAvailable).toEqual(['mi-2'])
    expect(result.makeUnavailable).toEqual([])
  })

  it('reports the levels to persist so the next delta can reason about them', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: STORE, in_stock: 7 }],
      STORE,
      rows(0, 0)
    )

    expect(result.stockUpdates).toEqual([{ variant_id: 'var_s', in_stock: 7 }])
  })

  it('does not persist levels for other stores', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_s', store_id: 'other', in_stock: 7 }],
      STORE,
      rows(0, 0)
    )

    expect(result.stockUpdates).toEqual([])
  })

  it('still 86es a single-variant dish on its own delta', () => {
    const result = partitionAvailabilityChanges(
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      STORE,
      rows(5, 5)
    )

    expect(result.makeUnavailable).toEqual(['mi-1'])
  })
})
