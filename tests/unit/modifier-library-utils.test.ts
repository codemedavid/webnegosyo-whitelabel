import { describe, it, expect } from '@jest/globals'
import {
  modifierGroupLibraryEntrySchema,
  libraryEntryToModifierGroup,
  buildLibraryDraftFromGroup,
  attachEntriesToGroups,
} from '@/lib/modifier-library-utils'
import type { ModifierGroup, ModifierGroupLibraryEntry } from '@/types/database'

// Deterministic id factory so snapshots are assertable.
function seqIds(prefix = 'new'): () => string {
  let n = 0
  return () => `${prefix}_${++n}`
}

function makeEntry(overrides: Partial<ModifierGroupLibraryEntry> = {}): ModifierGroupLibraryEntry {
  return {
    id: 'lib_1',
    tenant_id: 'tenant_1',
    name: 'Size',
    min_select: 1,
    max_select: 1,
    options: [
      { id: 'opt_a', name: 'Small', price_modifier: 0, is_default: true, display_order: 0 },
      { id: 'opt_b', name: 'Large', price_modifier: 20, display_order: 1, manual_cost: 8 },
    ],
    is_active: true,
    display_order: 0,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
    ...overrides,
  }
}

describe('modifierGroupLibraryEntrySchema', () => {
  it('accepts a minimal single-select group and defaults optional fields', () => {
    const parsed = modifierGroupLibraryEntrySchema.parse({
      name: 'Size',
      options: [{ name: 'Small' }],
    })

    expect(parsed.name).toBe('Size')
    expect(parsed.min_select).toBe(0)
    expect(parsed.max_select).toBeNull()
    expect(parsed.is_active).toBe(true)
    expect(parsed.display_order).toBe(0)
    expect(parsed.options[0].price_modifier).toBe(0)
  })

  it('rejects an empty group name', () => {
    expect(() =>
      modifierGroupLibraryEntrySchema.parse({ name: '', options: [{ name: 'Small' }] }),
    ).toThrow()
  })

  it('rejects a group with no options', () => {
    expect(() => modifierGroupLibraryEntrySchema.parse({ name: 'Size', options: [] })).toThrow()
  })

  it('rejects max_select smaller than min_select', () => {
    expect(() =>
      modifierGroupLibraryEntrySchema.parse({
        name: 'Size',
        min_select: 2,
        max_select: 1,
        options: [{ name: 'A' }, { name: 'B' }],
      }),
    ).toThrow()
  })

  it('allows unlimited multi-select (max_select null) with a min', () => {
    const parsed = modifierGroupLibraryEntrySchema.parse({
      name: 'Add-ons',
      min_select: 1,
      max_select: null,
      options: [{ name: 'Cheese', price_modifier: 15 }],
    })
    expect(parsed.max_select).toBeNull()
    expect(parsed.min_select).toBe(1)
  })
})

describe('libraryEntryToModifierGroup', () => {
  it('produces a group with a fresh id and fresh option ids', () => {
    const group = libraryEntryToModifierGroup(makeEntry(), seqIds())

    expect(group.id).toBe('new_1')
    expect(group.options.map((o) => o.id)).toEqual(['new_2', 'new_3'])
    // Original library ids are never leaked into the item payload.
    expect(group.id).not.toBe('lib_1')
    expect(group.options.map((o) => o.id)).not.toContain('opt_a')
  })

  it('preserves the group name, selection rules, and option definitions', () => {
    const group = libraryEntryToModifierGroup(makeEntry(), seqIds())

    expect(group.name).toBe('Size')
    expect(group.min_select).toBe(1)
    expect(group.max_select).toBe(1)
    expect(group.options[0]).toMatchObject({ name: 'Small', price_modifier: 0, is_default: true })
    expect(group.options[1]).toMatchObject({ name: 'Large', price_modifier: 20, manual_cost: 8 })
  })

  it('does not carry per-item stock state into the snapshot', () => {
    const entry = makeEntry({
      options: [
        // Even if a stale stock field sneaks into a library row, the attached
        // snapshot must start with no per-item stock.
        { id: 'opt_a', name: 'Small', price_modifier: 0, display_order: 0, stock_mode: 'simple', stock_qty: 5 },
      ],
    })
    const group = libraryEntryToModifierGroup(entry, seqIds())

    expect(group.options[0].stock_mode).toBeUndefined()
    expect(group.options[0].stock_qty).toBeUndefined()
  })
})

describe('buildLibraryDraftFromGroup', () => {
  it('prefills a draft from an existing item group, stripping ids', () => {
    const group: ModifierGroup = {
      id: 'grp_x',
      name: 'Spice Level',
      display_order: 2,
      min_select: 1,
      max_select: 1,
      options: [
        { id: 'o1', name: 'Mild', price_modifier: 0, display_order: 0, is_default: true },
        { id: 'o2', name: 'Hot', price_modifier: 0, display_order: 1 },
      ],
    }

    const draft = buildLibraryDraftFromGroup(group)

    expect(draft.name).toBe('Spice Level')
    expect(draft.min_select).toBe(1)
    expect(draft.max_select).toBe(1)
    expect(draft.options).toHaveLength(2)
    expect(draft.options[0]).toMatchObject({ name: 'Mild', is_default: true })
    // The draft is validation input — it must not carry runtime ids.
    expect((draft.options[0] as Record<string, unknown>).id).toBeUndefined()
  })
})

describe('attachEntriesToGroups', () => {
  it('appends snapshots of entries to the existing groups (immutable)', () => {
    const existing: ModifierGroup[] = [
      { id: 'g0', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [] },
    ]
    const entries = [makeEntry({ name: 'Add-ons', display_order: 0 })]

    const result = attachEntriesToGroups(existing, entries, seqIds())

    expect(result).toHaveLength(2)
    expect(result[1].name).toBe('Add-ons')
    // Immutable: original array/objects untouched.
    expect(existing).toHaveLength(1)
    expect(result).not.toBe(existing)
  })

  it('skips an entry whose group name already exists (case-insensitive)', () => {
    const existing: ModifierGroup[] = [
      { id: 'g0', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [] },
    ]
    const entries = [makeEntry({ name: 'size' }), makeEntry({ name: 'Add-ons' })]

    const result = attachEntriesToGroups(existing, entries, seqIds())

    expect(result.map((g) => g.name)).toEqual(['Size', 'Add-ons'])
  })

  it('assigns display_order after the current maximum so new groups sort last', () => {
    const existing: ModifierGroup[] = [
      { id: 'g0', name: 'Size', display_order: 5, min_select: 1, max_select: 1, options: [] },
    ]
    const entries = [makeEntry({ name: 'Add-ons' }), makeEntry({ name: 'Sauce' })]

    const result = attachEntriesToGroups(existing, entries, seqIds())

    expect(result[1].display_order).toBe(6)
    expect(result[2].display_order).toBe(7)
  })
})
