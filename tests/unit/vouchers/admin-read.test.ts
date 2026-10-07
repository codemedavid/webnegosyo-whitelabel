/**
 * The voucher list is read in ONE query with its targets embedded
 * (`*, voucher_targets(...)`), instead of the vouchers and then — after they
 * arrived — every target in a second round trip. These tests pin that the
 * embedded rows map to exactly what the two-query read produced.
 */

const BASE_ROW = {
  tenant_id: 't1',
  code: 'SAVE10',
  name: 'Launch',
  description: null,
  discount_type: 'percentage',
  discount_value: 10,
  max_discount_amount: null,
  min_order_amount: 0,
  is_stackable: false,
  usage_limit_total: null,
  usage_limit_per_customer: null,
  used_count: 0,
  starts_at: null,
  ends_at: null,
  is_active: true,
  channels: ['checkout', 'pos', 'admin'],
  outlet_ids: null,
  created_at: '2026-10-01T00:00:00Z',
}

async function load() {
  return import('@/lib/vouchers/admin-read')
}

describe('mapVoucherListRows', () => {
  test('attaches each voucher its own embedded targets', async () => {
    // Arrange
    const { mapVoucherListRows } = await load()
    const rows = [
      {
        ...BASE_ROW,
        id: 'v1',
        scope: 'products',
        voucher_targets: [{ voucher_id: 'v1', target_type: 'menu_item', target_id: 'item-a' }],
      },
      {
        ...BASE_ROW,
        id: 'v2',
        code: 'DRINKS',
        scope: 'categories',
        voucher_targets: [{ voucher_id: 'v2', target_type: 'category', target_id: 'cat-drinks' }],
      },
    ]

    // Act
    const vouchers = mapVoucherListRows(rows)

    // Assert
    expect(vouchers.map((v) => [v.id, v.targetIds])).toEqual([
      ['v1', ['item-a']],
      ['v2', ['cat-drinks']],
    ])
  })

  test('maps the same as the two-query read did', async () => {
    const { mapVoucherListRows } = await load()
    const { mapVoucherRow } = await import('@/lib/vouchers/mapper')
    const targets = [{ voucher_id: 'v1', target_type: 'menu_item', target_id: 'item-a' }]
    const row = { ...BASE_ROW, id: 'v1', scope: 'products' }

    expect(mapVoucherListRows([{ ...row, voucher_targets: targets }])).toEqual([mapVoucherRow(row, targets)])
  })

  test('reads a voucher with no embedded targets as having none', async () => {
    const { mapVoucherListRows } = await load()

    const [scoped] = mapVoucherListRows([{ ...BASE_ROW, id: 'v1', scope: 'products', voucher_targets: null }])

    // Scoped with an empty list = matches nothing, the safe reading.
    expect(scoped.targetIds).toEqual([])
  })

  test('returns an empty list for no rows', async () => {
    const { mapVoucherListRows } = await load()

    expect(mapVoucherListRows([])).toEqual([])
  })
})

describe('VOUCHER_LIST_SELECT', () => {
  test('embeds the targets in the same read', async () => {
    const { VOUCHER_LIST_SELECT } = await load()

    expect(VOUCHER_LIST_SELECT).toMatch(/voucher_targets\(\s*voucher_id,\s*target_type,\s*target_id\s*\)/)
  })
})

// A module, not a global script: its `load` helper must not collide with other tests'.
export {}
