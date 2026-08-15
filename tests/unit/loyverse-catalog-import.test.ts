import { buildMapRowInserts } from '@/lib/loyverse/catalog-import'
import type { MappedLoyverseItem } from '@/lib/loyverse/catalog-mapper'

function mappedItem(overrides: Partial<MappedLoyverseItem>): MappedLoyverseItem {
  return {
    loyverseItemId: 'item_1',
    name: 'Americano',
    description: '',
    imageUrl: null,
    categoryLoyverseId: null,
    price: 100,
    isAvailable: true,
    modifierGroups: [],
    mapRows: [],
    ...overrides,
  }
}

describe('buildMapRowInserts', () => {
  it('attaches the resolved menu_item_id to variant rows', () => {
    const items = [
      mappedItem({
        loyverseItemId: 'item_1',
        mapRows: [
          {
            kind: 'variant',
            local_key: '',
            loyverse_item_id: 'item_1',
            loyverse_variant_id: 'var_1',
            loyverse_modifier_id: null,
            loyverse_modifier_option_id: null,
            loyverse_sku: '10001',
          },
        ],
      }),
    ]

    const rows = buildMapRowInserts('tenant-1', items, { item_1: 'menu-item-uuid' })

    expect(rows).toEqual([
      expect.objectContaining({
        tenant_id: 'tenant-1',
        kind: 'variant',
        menu_item_id: 'menu-item-uuid',
        loyverse_variant_id: 'var_1',
      }),
    ])
  })

  it('dedupes modifier-option rows shared by multiple items and leaves menu_item_id null', () => {
    const sharedRow = {
      kind: 'modifier_option' as const,
      local_key: 'lvm-opt_1',
      loyverse_item_id: null,
      loyverse_variant_id: null,
      loyverse_modifier_id: 'mod_1',
      loyverse_modifier_option_id: 'opt_1',
      loyverse_sku: null,
    }
    const items = [
      mappedItem({ loyverseItemId: 'item_1', mapRows: [sharedRow] }),
      mappedItem({ loyverseItemId: 'item_2', mapRows: [{ ...sharedRow }] }),
    ]

    const rows = buildMapRowInserts('tenant-1', items, { item_1: 'a', item_2: 'b' })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({ kind: 'modifier_option', menu_item_id: null })
    )
  })

  it('drops variant rows whose item failed to import (no menu_item_id resolved)', () => {
    const items = [
      mappedItem({
        loyverseItemId: 'item_broken',
        mapRows: [
          {
            kind: 'variant',
            local_key: '',
            loyverse_item_id: 'item_broken',
            loyverse_variant_id: 'var_x',
            loyverse_modifier_id: null,
            loyverse_modifier_option_id: null,
            loyverse_sku: null,
          },
        ],
      }),
    ]

    expect(buildMapRowInserts('tenant-1', items, {})).toEqual([])
  })
})
