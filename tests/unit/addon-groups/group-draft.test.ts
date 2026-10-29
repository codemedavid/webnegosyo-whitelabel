import { describe, it, expect } from '@jest/globals'
import { draftFromEntry, draftToInput, emptyGroupDraft } from '@/lib/addon-groups/group-draft'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/** The Add-on groups editor form ⇄ what the library stores. */

describe('group draft', () => {
  it('starts as an optional add-ons group with one blank row', () => {
    const draft = emptyGroupDraft()
    expect(draft).toMatchObject({ name: '', mode: 'quantity', isRequired: false, maxText: '' })
    expect(draft.options).toHaveLength(1)
  })

  it('turns a filled form into library input, dropping blank rows', () => {
    const result = draftToInput({
      name: '  Add-ons ',
      mode: 'quantity',
      isRequired: false,
      maxText: '',
      options: [
        { key: 'a', name: 'Fried Rice', price: '15' },
        { key: 'b', name: '  ', price: '' },
        { key: 'c', name: 'Egg', price: '' },
      ],
    })

    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Add-ons',
        selection_mode: 'quantity',
        min_select: 0,
        max_select: null,
        options: [
          { name: 'Fried Rice', price_modifier: 15, display_order: 0 },
          { name: 'Egg', price_modifier: 0, display_order: 1 },
        ],
      },
    })
  })

  it('maps a required single choice', () => {
    const result = draftToInput({
      name: 'Rice',
      mode: 'choice',
      isRequired: true,
      maxText: '1',
      options: [{ key: 'a', name: 'Plain', price: '0' }, { key: 'b', name: 'Garlic', price: '10' }],
    })

    expect(result.ok && result.input).toMatchObject({ selection_mode: 'choice', min_select: 1, max_select: 1 })
  })

  it.each([
    [{ name: '' }, 'Give the group a name'],
    [{ options: [{ key: 'a', name: '', price: '' }] }, 'Add at least one add-on'],
    [{ options: [{ key: 'a', name: 'Egg', price: '-5' }] }, 'Prices must be 0 or more'],
    [{ options: [{ key: 'a', name: 'Egg', price: 'abc' }] }, 'Prices must be 0 or more'],
    [{ maxText: '0' }, 'The limit must be a whole number of at least 1'],
    [{ isRequired: true, maxText: '' , mode: 'choice' as const, options: [] }, 'Add at least one add-on'],
  ])('refuses %o', (overrides, message) => {
    const base = { name: 'Add-ons', mode: 'quantity' as const, isRequired: false, maxText: '', options: [{ key: 'a', name: 'Egg', price: '20' }] }
    expect(draftToInput({ ...base, ...overrides })).toEqual({ ok: false, error: message })
  })

  it('refuses a required choice with fewer options than its minimum', () => {
    const result = draftToInput({ name: 'Rice', mode: 'choice', isRequired: true, maxText: '', options: [] })
    expect(result.ok).toBe(false)
  })

  it('round-trips a stored group', () => {
    const entry: ModifierGroupLibraryEntry = {
      id: 'g', tenant_id: 't', name: 'Add-ons', selection_mode: 'quantity', min_select: 0, max_select: 5,
      options: [{ id: 'o', name: 'Egg', price_modifier: 20, display_order: 0 }],
      is_active: true, display_order: 0, created_at: '', updated_at: '',
    }

    const draft = draftFromEntry(entry)
    expect(draft).toMatchObject({ name: 'Add-ons', mode: 'quantity', isRequired: false, maxText: '5' })
    expect(draftToInput(draft)).toMatchObject({ ok: true, input: { max_select: 5, options: [{ name: 'Egg', price_modifier: 20 }] } })
  })
})
