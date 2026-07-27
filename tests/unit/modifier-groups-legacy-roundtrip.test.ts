import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { splitGroupsToLegacyColumns } from '@/lib/modifier-groups-form'
import type { MenuItem, VariationType } from '@/types/database'

/**
 * Enabling `modifier_groups_enabled` migrates existing items in place: the admin
 * editor seeds itself with `normalizeModifierGroups(item)` (derived from the
 * legacy columns) and, on save, writes both `modifier_groups` and the
 * `splitGroupsToLegacyColumns` mirror back to the legacy columns.
 *
 * That makes the derive → split round-trip a data-migration path for every item
 * a merchant opens, not just a display concern. Any field dropped along the way
 * is destroyed the first time someone hits Save. These tests pin the round-trip
 * before the flag is rolled out platform-wide.
 */

const variationTypes: VariationType[] = [
  {
    id: 'vt-size',
    name: 'Size',
    is_required: true,
    display_order: 0,
    options: [
      {
        id: 'vo-small',
        name: 'Small',
        price_modifier: 0,
        display_order: 0,
        is_default: true,
      },
      {
        id: 'vo-large',
        name: 'Large',
        price_modifier: 25,
        display_order: 1,
        image_url: 'https://cdn.example/large.jpg',
        // Drives the "Upgrade for +25" nudge on the storefront.
        is_upgrade_target: true,
      },
    ],
  },
]

function itemWithLegacyColumns(): Partial<MenuItem> {
  return {
    variation_types: variationTypes,
    variations: [],
    addons: [
      { id: 'ad-cheese', name: 'Extra Cheese', price: 15, is_default: false },
      { id: 'ad-egg', name: 'Egg', price: 10, is_default: true },
    ],
  }
}

function roundTrip(item: Partial<MenuItem>) {
  return splitGroupsToLegacyColumns(normalizeModifierGroups(item))
}

describe('legacy → modifier groups → legacy round-trip', () => {
  it('preserves the upgrade-target flag that drives the upgrade nudge', () => {
    const large = roundTrip(itemWithLegacyColumns())
      .variation_types[0].options.find((o) => o.id === 'vo-large')

    expect(large?.is_upgrade_target).toBe(true)
  })

  it('keeps a non-upgrade option free of the flag rather than defaulting it on', () => {
    const small = roundTrip(itemWithLegacyColumns())
      .variation_types[0].options.find((o) => o.id === 'vo-small')

    expect(small?.is_upgrade_target).toBeFalsy()
  })

  it('preserves variation type identity, name and required flag', () => {
    const [type] = roundTrip(itemWithLegacyColumns()).variation_types

    expect(type.id).toBe('vt-size')
    expect(type.name).toBe('Size')
    expect(type.is_required).toBe(true)
  })

  it('preserves every option field the storefront renders', () => {
    const large = roundTrip(itemWithLegacyColumns())
      .variation_types[0].options.find((o) => o.id === 'vo-large')

    expect(large).toMatchObject({
      id: 'vo-large',
      name: 'Large',
      price_modifier: 25,
      image_url: 'https://cdn.example/large.jpg',
      display_order: 1,
    })
  })

  it('preserves add-ons with their prices and defaults', () => {
    const { addons } = roundTrip(itemWithLegacyColumns())

    expect(addons).toEqual([
      { id: 'ad-cheese', name: 'Extra Cheese', price: 15, is_default: false },
      { id: 'ad-egg', name: 'Egg', price: 10, is_default: true },
    ])
  })

  it('is stable across a second round-trip (idempotent migration)', () => {
    const once = roundTrip(itemWithLegacyColumns())
    const twice = roundTrip(once)

    expect(twice).toEqual(once)
  })
})
