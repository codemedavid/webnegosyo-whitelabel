/**
 * The Add-on groups editor form, and its translation to library input.
 *
 * Owners think "Add-ons: Fried Rice ₱15, Egg ₱20, optional", not min/max
 * selection rules, so the form keeps text fields and two plain choices; this
 * module turns that into a `ModifierGroupLibraryInput` (or a sentence saying
 * what to fix). Pure and client-safe.
 */

import type { ModifierGroupLibraryInput } from '@/lib/modifier-library-utils'
import type { ModifierGroupLibraryEntry } from '@/types/database'

/** quantity = customers choose how many of each; choice = they pick from a list. */
export type GroupDraftMode = 'quantity' | 'choice'

export interface GroupDraftOption {
  /** Stable React key only; never stored. */
  key: string
  name: string
  price: string
}

export interface GroupDraft {
  name: string
  mode: GroupDraftMode
  isRequired: boolean
  /** Blank = no limit. quantity: total portions; choice: options picked. */
  maxText: string
  options: GroupDraftOption[]
}

export type DraftResult =
  | { ok: true; input: Pick<ModifierGroupLibraryInput, 'name' | 'selection_mode' | 'min_select' | 'max_select' | 'options'> }
  | { ok: false; error: string }

const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`

export const blankOption = (name = '', price = ''): GroupDraftOption => ({ key: newKey(), name, price })

export function emptyGroupDraft(): GroupDraft {
  return { name: '', mode: 'quantity', isRequired: false, maxText: '', options: [blankOption()] }
}

export function draftFromEntry(entry: ModifierGroupLibraryEntry): GroupDraft {
  return {
    name: entry.name,
    mode: entry.selection_mode === 'quantity' ? 'quantity' : 'choice',
    isRequired: entry.min_select > 0,
    maxText: entry.max_select === null ? '' : String(entry.max_select),
    options: [...entry.options]
      .sort((a, b) => a.display_order - b.display_order)
      .map((option) => blankOption(option.name, String(option.price_modifier))),
  }
}

function parsePrice(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null
}

function parseMax(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) && value >= 1 ? value : 'invalid'
}

export function draftToInput(draft: GroupDraft): DraftResult {
  const name = draft.name.trim()
  if (name === '') return { ok: false, error: 'Give the group a name' }

  const filled = draft.options.filter((option) => option.name.trim() !== '')
  if (filled.length === 0) return { ok: false, error: 'Add at least one add-on' }

  const prices = filled.map((option) => parsePrice(option.price))
  if (prices.some((price) => price === null)) return { ok: false, error: 'Prices must be 0 or more' }

  const max = parseMax(draft.maxText)
  if (max === 'invalid') return { ok: false, error: 'The limit must be a whole number of at least 1' }

  const min = draft.isRequired ? 1 : 0
  if (draft.mode === 'choice' && min > filled.length) return { ok: false, error: 'Add at least one add-on' }

  return {
    ok: true,
    input: {
      name,
      selection_mode: draft.mode,
      min_select: min,
      max_select: max,
      options: filled.map((option, index) => ({
        name: option.name.trim(),
        price_modifier: prices[index] as number,
        display_order: index,
      })),
    },
  }
}
