/**
 * Live Loyverse stock verification at checkout.
 *
 * The mirror can always be stale: a webhook may be unregistered, disabled by
 * Loyverse after 48h of failures, or simply in flight. Reading stock live at
 * the moment an order is placed is the one check that cannot be stale — and
 * it costs a single request per order, far under Loyverse's 300 req / 300 s
 * per-merchant budget.
 *
 * The decision is a pure function so the network half stays trivial. Its bias
 * is deliberate and matches inventory-sync: only a POSITIVE report of zero
 * blocks a sale. Unknown, untracked, or unmapped never blocks — a checkout
 * that refuses good orders because Loyverse was quiet is worse than one that
 * occasionally oversells.
 */

import { findOutOfStockLines } from '@/lib/loyverse/stock-check'

const STORE = 'store_1'

const mapRows = [
  { kind: 'variant', menu_item_id: 'mi-1', loyverse_variant_id: 'var_1', local_key: '' },
  { kind: 'variant', menu_item_id: 'mi-2', loyverse_variant_id: 'var_s', local_key: 'lv-var_s' },
  { kind: 'variant', menu_item_id: 'mi-2', loyverse_variant_id: 'var_l', local_key: 'lv-var_l' },
] as const

const line = (menuItemId: string, name: string, quantity = 1) => ({
  menu_item_id: menuItemId,
  menu_item_name: name,
  quantity,
})

describe('findOutOfStockLines', () => {
  it('blocks a dish whose only variant is reported empty', () => {
    const blocked = findOutOfStockLines(
      [line('mi-1', 'Americano')],
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([{ menu_item_id: 'mi-1', menu_item_name: 'Americano' }])
  })

  it('allows a dish that still has stock', () => {
    const blocked = findOutOfStockLines(
      [line('mi-1', 'Americano')],
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 3 }],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([])
  })

  it('allows a multi-variant dish while any variant has stock', () => {
    const blocked = findOutOfStockLines(
      [line('mi-2', 'Latte')],
      [
        { variant_id: 'var_s', store_id: STORE, in_stock: 0 },
        { variant_id: 'var_l', store_id: STORE, in_stock: 2 },
      ],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([])
  })

  it('blocks a multi-variant dish only when every variant is empty', () => {
    const blocked = findOutOfStockLines(
      [line('mi-2', 'Latte')],
      [
        { variant_id: 'var_s', store_id: STORE, in_stock: 0 },
        { variant_id: 'var_l', store_id: STORE, in_stock: 0 },
      ],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([{ menu_item_id: 'mi-2', menu_item_name: 'Latte' }])
  })

  it('never blocks a dish Loyverse did not report on', () => {
    // Untracked items are the majority for most merchants; silence is not zero.
    const blocked = findOutOfStockLines([line('mi-1', 'Americano')], [], STORE, mapRows)

    expect(blocked).toEqual([])
  })

  it('never blocks a locally authored dish that has no Loyverse mapping', () => {
    const blocked = findOutOfStockLines(
      [line('mi-local', 'House Blend')],
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([])
  })

  it('ignores stock reported for a different store', () => {
    const blocked = findOutOfStockLines(
      [line('mi-1', 'Americano')],
      [{ variant_id: 'var_1', store_id: 'other-store', in_stock: 0 }],
      STORE,
      mapRows
    )

    expect(blocked).toEqual([])
  })

  it('reports each blocked dish once even when ordered on several lines', () => {
    const blocked = findOutOfStockLines(
      [line('mi-1', 'Americano'), line('mi-1', 'Americano', 2)],
      [{ variant_id: 'var_1', store_id: STORE, in_stock: 0 }],
      STORE,
      mapRows
    )

    expect(blocked).toHaveLength(1)
  })

  it('treats a negative level as empty', () => {
    // Loyverse permits negative stock when a sale outruns a receipt.
    const blocked = findOutOfStockLines(
      [line('mi-1', 'Americano')],
      [{ variant_id: 'var_1', store_id: STORE, in_stock: -2 }],
      STORE,
      mapRows
    )

    expect(blocked).toHaveLength(1)
  })
})
