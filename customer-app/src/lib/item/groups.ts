import type { AppMenuItem, AppModifierGroup } from '@/lib/contract'
import type { Selections } from '@/lib/cart/pricing'
import { formatPeso, toCentavos } from '@/lib/money'

/** How a group is drawn: radio rows, checkbox rows, or a stepper per option. */
export type GroupKind = 'single' | 'multi' | 'quantity'

export interface GroupSummary {
  kind: GroupKind
  isRequired: boolean
  /** "Choose 1", "Choose up to 3", "Choose at least 2", "Optional". */
  hint: string
  picked: number
  isSatisfied: boolean
}

export function groupKind(group: AppModifierGroup): GroupKind {
  if (group.selectionMode === 'quantity') return 'quantity'
  return group.maxSelect === 1 ? 'single' : 'multi'
}

const pickedIn = (group: AppModifierGroup, selections: Selections) =>
  Object.values(selections[group.id] ?? {}).reduce((sum, count) => sum + count, 0)

function hintFor(group: AppModifierGroup): string {
  const { minSelect, maxSelect } = group
  if (minSelect > 0 && maxSelect === minSelect) return `Choose ${minSelect}`
  if (minSelect > 1) return `Choose at least ${minSelect}`
  if (maxSelect !== null) return minSelect === 1 ? `Choose 1 to ${maxSelect}` : `Choose up to ${maxSelect}`
  return minSelect === 1 ? 'Choose at least 1' : 'Optional'
}

export function groupSummary(group: AppModifierGroup, selections: Selections): GroupSummary {
  const picked = pickedIn(group, selections)
  const isWithinMax = group.maxSelect === null || picked <= group.maxSelect
  return {
    kind: groupKind(group),
    isRequired: group.minSelect > 0,
    hint: hintFor(group),
    picked,
    isSatisfied: picked >= group.minSelect && isWithinMax,
  }
}

/** The group the Add button should scroll to; null when the dish is ready to add. */
export function firstUnmetGroupId(item: AppMenuItem, selections: Selections): string | null {
  return item.modifierGroups.find((group) => !groupSummary(group, selections).isSatisfied)?.id ?? null
}

/** "+₱20" beside an option; free options say nothing. */
export function formatPriceDelta(pesos: number): string {
  const centavos = toCentavos(pesos)
  return centavos > 0 ? `+${formatPeso(centavos)}` : ''
}

/** A dish that can go straight in the bag from a card: on sale and nothing it must ask. */
export function canQuickAdd(item: AppMenuItem): boolean {
  return item.isAvailable && item.modifierGroups.every((group) => group.minSelect === 0)
}
