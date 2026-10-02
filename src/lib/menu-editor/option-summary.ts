/**
 * One line per list a customer will see on the dish ("Size: Regular, Large
 * +₱25"), for the editor's live preview and section navigation. Rows the owner
 * has not named yet are left out — the customer would not see them either.
 */

import { formatPrice } from '@/lib/cart-utils'
import type { ModifierGroup, Variation, VariationType } from '@/types/database'
import { SIZE_GROUP_NAME } from '@/lib/menu-editor/legacy-option-convert'

export interface OptionSummaryLine {
  label: string
  values: string[]
}

interface NamedPrice {
  name: string
  price: number
}

export interface LegacyOptionsSnapshot {
  isGrouped: boolean
  variations: readonly Variation[]
  variationTypes: readonly VariationType[]
  addons: readonly { id: string; name: string; price: number }[]
}

export function describeExtraCharge(amount: number): string {
  return Number.isFinite(amount) && amount > 0 ? `+${formatPrice(amount)}` : ''
}

function describeOptions(options: readonly NamedPrice[]): string[] {
  return options
    .filter((option) => option.name.trim().length > 0)
    .map((option) => [option.name.trim(), describeExtraCharge(option.price)].filter(Boolean).join(' '))
}

function toLine(label: string, options: readonly NamedPrice[]): OptionSummaryLine | null {
  const values = describeOptions(options)
  return values.length > 0 ? { label, values } : null
}

function isLine(line: OptionSummaryLine | null): line is OptionSummaryLine {
  return line !== null
}

const choiceLabel = (name: string, index: number) => name.trim() || `Choice ${index + 1}`

export function summarizeLegacyOptions(snapshot: LegacyOptionsSnapshot): OptionSummaryLine[] {
  const choiceLines = snapshot.isGrouped
    ? snapshot.variationTypes.map((type, index) =>
        toLine(choiceLabel(type.name, index), type.options.map((o) => ({ name: o.name, price: o.price_modifier }))),
      )
    : [toLine(SIZE_GROUP_NAME, snapshot.variations.map((v) => ({ name: v.name, price: v.price_modifier })))]

  return [...choiceLines, toLine('Add-ons', snapshot.addons)].filter(isLine)
}

export function summarizeModifierGroups(groups: readonly ModifierGroup[]): OptionSummaryLine[] {
  return groups
    .map((group, index) =>
      toLine(choiceLabel(group.name, index), group.options.map((o) => ({ name: o.name, price: o.price_modifier }))),
    )
    .filter(isLine)
}

/** "3 sizes" / "1 choice" for a section header; nothing when there are none. */
export function describeChoiceCount(isGrouped: boolean, count: number): string | undefined {
  if (count <= 0) return undefined
  const noun = isGrouped ? 'choice' : 'size'
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
