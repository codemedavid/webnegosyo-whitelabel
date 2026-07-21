import { describe, it, expect } from '@jest/globals'
import {
  addonLibraryEntrySchema,
  libraryEntryToAddon,
  buildLibraryDraftFromMenuItem,
  attachEntriesToAddons,
} from '@/lib/addon-library-service'
import type { AddonLibraryEntry, Addon, MenuItem } from '@/types/database'

const UUID = '11111111-1111-4111-8111-111111111111'

function makeEntry(overrides: Partial<AddonLibraryEntry> = {}): AddonLibraryEntry {
  return {
    id: 'entry_1',
    tenant_id: 'tenant_1',
    name: 'Extra Cheese',
    price: 25,
    source_menu_item_id: null,
    image_url: null,
    is_active: true,
    display_order: 0,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

describe('addonLibraryEntrySchema', () => {
  it('accepts a minimal manual entry and defaults optional fields', () => {
    const parsed = addonLibraryEntrySchema.parse({ name: 'Extra Cheese', price: 25 })

    expect(parsed.name).toBe('Extra Cheese')
    expect(parsed.price).toBe(25)
    expect(parsed.is_active).toBe(true)
    expect(parsed.display_order).toBe(0)
    expect(parsed.source_menu_item_id).toBeNull()
  })

  it('rejects an empty name', () => {
    expect(() => addonLibraryEntrySchema.parse({ name: '', price: 10 })).toThrow()
  })

  it('rejects a negative price', () => {
    expect(() => addonLibraryEntrySchema.parse({ name: 'Extra', price: -1 })).toThrow()
  })

  it('allows a zero price (free add-on)', () => {
    expect(addonLibraryEntrySchema.parse({ name: 'No Onions', price: 0 }).price).toBe(0)
  })

  it('accepts a valid source_menu_item_id uuid', () => {
    const parsed = addonLibraryEntrySchema.parse({ name: 'Fries', price: 40, source_menu_item_id: UUID })
    expect(parsed.source_menu_item_id).toBe(UUID)
  })

  it('rejects a non-uuid source_menu_item_id', () => {
    expect(() => addonLibraryEntrySchema.parse({ name: 'Fries', price: 40, source_menu_item_id: 'nope' })).toThrow()
  })
})

describe('libraryEntryToAddon', () => {
  it('copies name and price into an Addon snapshot with a fresh id', () => {
    const addon = libraryEntryToAddon(makeEntry(), () => 'addon_new')
    expect(addon).toEqual({ id: 'addon_new', name: 'Extra Cheese', price: 25 })
  })

  it('does not carry over library-only fields (tenant_id, source_menu_item_id)', () => {
    const addon = libraryEntryToAddon(makeEntry({ source_menu_item_id: UUID }), () => 'addon_new')
    expect(addon).not.toHaveProperty('tenant_id')
    expect(addon).not.toHaveProperty('source_menu_item_id')
  })
})

describe('buildLibraryDraftFromMenuItem', () => {
  it('prefills name, price and source_menu_item_id from a menu item', () => {
    const item = { id: UUID, name: 'Regular Fries', price: 40 } as MenuItem
    const draft = buildLibraryDraftFromMenuItem(item)
    expect(draft).toEqual({ name: 'Regular Fries', price: 40, source_menu_item_id: UUID })
  })

  it('prefers the discounted price when present', () => {
    const item = { id: UUID, name: 'Combo', price: 100, discounted_price: 80 } as MenuItem
    expect(buildLibraryDraftFromMenuItem(item).price).toBe(80)
  })
})

describe('attachEntriesToAddons', () => {
  let counter: number
  const makeId = () => `addon_${++counter}`
  beforeEach(() => {
    counter = 0
  })

  it('appends snapshots of the given entries to existing addons', () => {
    const existing: Addon[] = [{ id: 'a0', name: 'Bacon', price: 30 }]
    const result = attachEntriesToAddons(existing, [makeEntry()], makeId)
    expect(result).toEqual([
      { id: 'a0', name: 'Bacon', price: 30 },
      { id: 'addon_1', name: 'Extra Cheese', price: 25 },
    ])
  })

  it('does not mutate the existing addons array', () => {
    const existing: Addon[] = [{ id: 'a0', name: 'Bacon', price: 30 }]
    attachEntriesToAddons(existing, [makeEntry()], makeId)
    expect(existing).toHaveLength(1)
  })

  it('skips entries whose name already exists (case-insensitive)', () => {
    const existing: Addon[] = [{ id: 'a0', name: 'extra cheese', price: 20 }]
    const result = attachEntriesToAddons(existing, [makeEntry({ name: 'Extra Cheese' })], makeId)
    expect(result).toHaveLength(1)
  })

  it('dedupes within the incoming batch too', () => {
    const result = attachEntriesToAddons(
      [],
      [makeEntry({ id: 'e1', name: 'Cheese' }), makeEntry({ id: 'e2', name: 'cheese' })],
      makeId,
    )
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cheese')
  })
})
