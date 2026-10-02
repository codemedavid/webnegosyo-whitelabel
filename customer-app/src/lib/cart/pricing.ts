import type { AppMenuItem, AppModifierGroup } from '@/lib/contract'
import { toCentavos } from '@/lib/money'

/** Picks per group: groupId → optionId → count. Choice groups only ever hold 1. */
export type Selections = Readonly<Record<string, Readonly<Record<string, number>>>>

export interface SelectionIssue {
  groupId: string
  message: string
}

export interface SelectionValidation {
  isValid: boolean
  issues: SelectionIssue[]
}

const groupPicks = (selections: Selections, groupId: string) => selections[groupId] ?? {}

const totalPicks = (picks: Readonly<Record<string, number>>) =>
  Object.values(picks).reduce((sum, count) => sum + count, 0)

const isSingleChoice = (group: AppModifierGroup) => group.selectionMode === 'choice' && group.maxSelect === 1

const withGroup = (selections: Selections, groupId: string, picks: Record<string, number>): Selections => ({
  ...selections,
  [groupId]: picks,
})

/** Defaults, plus the first available option of any required single choice left empty. */
export function defaultSelections(item: AppMenuItem): Selections {
  return Object.fromEntries(
    item.modifierGroups.map((group) => {
      const available = group.options.filter((option) => option.isAvailable)
      const defaults = available.filter((option) => option.isDefault)
      const limit = group.maxSelect ?? defaults.length
      const picked = defaults.slice(0, limit)
      if (picked.length === 0 && group.minSelect > 0 && isSingleChoice(group) && available[0])
        picked.push(available[0])
      return [group.id, Object.fromEntries(picked.map((option) => [option.id, 1]))]
    }),
  )
}

/**
 * Tap on an option. Single choice replaces (and never empties a required
 * group); multi choice toggles within the maximum.
 */
export function toggleOption(group: AppModifierGroup, selections: Selections, optionId: string): Selections {
  const option = group.options.find((candidate) => candidate.id === optionId)
  if (!option?.isAvailable) return selections
  const picks = groupPicks(selections, group.id)
  const isPicked = (picks[optionId] ?? 0) > 0

  if (isSingleChoice(group)) {
    if (isPicked) return group.minSelect > 0 ? selections : withGroup(selections, group.id, {})
    return withGroup(selections, group.id, { [optionId]: 1 })
  }
  if (isPicked) {
    const { [optionId]: _removed, ...rest } = picks
    return withGroup(selections, group.id, rest)
  }
  if (group.maxSelect !== null && totalPicks(picks) >= group.maxSelect) return selections
  return withGroup(selections, group.id, { ...picks, [optionId]: 1 })
}

/** Stepper for quantity groups; clamps so the whole group stays within its maximum. */
export function setOptionQuantity(
  group: AppModifierGroup,
  selections: Selections,
  optionId: string,
  quantity: number,
): Selections {
  const option = group.options.find((candidate) => candidate.id === optionId)
  if (!option?.isAvailable) return selections
  const { [optionId]: _current, ...others } = groupPicks(selections, group.id)
  const room = group.maxSelect === null ? Number.POSITIVE_INFINITY : group.maxSelect - totalPicks(others)
  const next = Math.max(0, Math.min(Math.floor(quantity), room))
  return withGroup(selections, group.id, next > 0 ? { ...others, [optionId]: next } : others)
}

export function validateSelections(item: AppMenuItem, selections: Selections): SelectionValidation {
  const issues = item.modifierGroups.flatMap((group): SelectionIssue[] => {
    const count = totalPicks(groupPicks(selections, group.id))
    if (count < group.minSelect) {
      const message =
        group.minSelect === 1 ? `Choose a ${group.name}` : `Choose at least ${group.minSelect} ${group.name}`
      return [{ groupId: group.id, message }]
    }
    if (group.maxSelect !== null && count > group.maxSelect)
      return [{ groupId: group.id, message: `Choose up to ${group.maxSelect} ${group.name}` }]
    return []
  })
  return { isValid: issues.length === 0, issues }
}

/** Base price plus every picked option × its count. Unknown groups/options count for nothing. */
export function unitPriceCentavos(item: AppMenuItem, selections: Selections): number {
  return item.modifierGroups.reduce((sum, group) => {
    const picks = groupPicks(selections, group.id)
    return group.options.reduce(
      (groupSum, option) => groupSum + toCentavos(option.priceDelta) * (picks[option.id] ?? 0),
      sum,
    )
  }, toCentavos(item.price))
}

/** Human labels in menu order: "Grande 16oz", "2× Extra espresso shot". */
export function describeSelections(item: AppMenuItem, selections: Selections): string[] {
  return item.modifierGroups.flatMap((group) => {
    const picks = groupPicks(selections, group.id)
    return group.options
      .filter((option) => (picks[option.id] ?? 0) > 0)
      .map((option) => (picks[option.id] > 1 ? `${picks[option.id]}× ${option.name}` : option.name))
  })
}
