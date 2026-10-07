/**
 * "How do customers choose?" — one plain question in place of the four
 * controls a modifier group used to show (group type, Required, Allow
 * multiple, and the type select).
 *
 * The rule is derived from the group's stored fields and written back through
 * the same setters the editor always used, so no stored shape changes: this
 * is a vocabulary over `selection_mode`, `min_select` and `max_select`, not a
 * new column.
 */

import type { ModifierGroup } from '@/types/database'
import { isSingleSelectGroup, setGroupMultiple, setGroupRequired } from '@/lib/modifier-groups-form'

export type ChoiceRule =
  | 'pick-one'
  | 'pick-one-optional'
  | 'pick-any'
  | 'pick-some'
  | 'extras-optional'
  | 'extras-required'

export const CHOICE_RULES = [
  { value: 'pick-one', label: 'Must pick 1', example: 'e.g. Size: Regular or Large' },
  { value: 'pick-one-optional', label: 'Can pick 1, or skip', example: 'e.g. Drink upgrade' },
  { value: 'pick-any', label: 'Can pick any, or skip', example: 'e.g. Toppings' },
  { value: 'pick-some', label: 'Must pick at least 1', example: 'e.g. Choose your 2 sides' },
  { value: 'extras-optional', label: 'Can add extras (with − / +)', example: 'e.g. Extra rice ×2' },
  { value: 'extras-required', label: 'Must add extras (with − / +)', example: 'e.g. Pick 3 pieces' },
] as const satisfies readonly { value: ChoiceRule; label: string; example: string }[]

export function isExtrasRule(rule: ChoiceRule): boolean {
  return rule === 'extras-optional' || rule === 'extras-required'
}

export function deriveChoiceRule(group: ModifierGroup): ChoiceRule {
  const isRequired = group.min_select >= 1
  if (group.selection_mode === 'quantity') return isRequired ? 'extras-required' : 'extras-optional'
  if (isSingleSelectGroup(group)) return isRequired ? 'pick-one' : 'pick-one-optional'
  return isRequired ? 'pick-some' : 'pick-any'
}

/**
 * Switching between choices and extras only flips the mode — limits and
 * options stay, so an owner who picks the wrong kind and switches back loses
 * nothing. Within choices, the single/multiple and required setters own the
 * min/max arithmetic.
 */
export function applyChoiceRule(group: ModifierGroup, rule: ChoiceRule): ModifierGroup {
  const isRequired = rule === 'pick-one' || rule === 'pick-some' || rule === 'extras-required'

  if (isExtrasRule(rule)) {
    return setGroupRequired({ ...group, selection_mode: 'quantity' }, isRequired)
  }

  const asChoice: ModifierGroup = { ...group, selection_mode: 'choice' }
  const isMultiple = rule === 'pick-any' || rule === 'pick-some'
  const wasMultiple = group.selection_mode === 'quantity' || !isSingleSelectGroup(group)
  const shaped = isMultiple === wasMultiple && group.selection_mode !== 'quantity'
    ? asChoice
    : setGroupMultiple(asChoice, isMultiple)
  return setGroupRequired(shaped, isRequired)
}

/**
 * The editor asks two small questions instead of one six-way select: what kind
 * of pick (one, several, or amounts with − / +) and whether it is required.
 * Both halves map one-to-one onto a `ChoiceRule`, so nothing stored changes.
 */
export type ChoiceKind = 'one' | 'several' | 'quantity'

export const CHOICE_KINDS = [
  { value: 'one', label: 'One', example: 'Size, temperature' },
  { value: 'several', label: 'Several', example: 'Toppings, sides' },
  { value: 'quantity', label: 'Amounts', example: 'Extra rice ×2' },
] as const satisfies readonly { value: ChoiceKind; label: string; example: string }[]

const RULE_PARTS: Record<ChoiceRule, { kind: ChoiceKind; isRequired: boolean }> = {
  'pick-one': { kind: 'one', isRequired: true },
  'pick-one-optional': { kind: 'one', isRequired: false },
  'pick-some': { kind: 'several', isRequired: true },
  'pick-any': { kind: 'several', isRequired: false },
  'extras-required': { kind: 'quantity', isRequired: true },
  'extras-optional': { kind: 'quantity', isRequired: false },
}

export function splitChoiceRule(rule: ChoiceRule): { kind: ChoiceKind; isRequired: boolean } {
  return RULE_PARTS[rule]
}

export function joinChoiceRule(kind: ChoiceKind, isRequired: boolean): ChoiceRule {
  const match = (Object.keys(RULE_PARTS) as ChoiceRule[]).find(
    (rule) => RULE_PARTS[rule].kind === kind && RULE_PARTS[rule].isRequired === isRequired,
  )
  // Every kind × required pair is in the table; the fallback only satisfies the type.
  return match ?? 'pick-one'
}
