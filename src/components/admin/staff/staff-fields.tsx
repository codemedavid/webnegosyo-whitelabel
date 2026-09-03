'use client'

import { Checkbox } from '@/components/ui/checkbox'
import {
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import type { DefaultScreenOption } from '@/lib/staff-default-screen'

/** A branch as the staff surfaces need to show and offer it. */
export interface StaffOutlet {
  id: string
  name: string
}

export const ALL_BRANCHES_LABEL = 'All branches'

/**
 * The branch a member covers, named rather than identified.
 *
 * A branch that no longer exists still has to render as words: deleting a
 * branch sets the column to NULL, but between that write and the next fetch a
 * stale row would otherwise print a raw uuid into the merchant's staff list.
 */
export function branchLabel(
  outletId: string | null | undefined,
  outlets: readonly StaffOutlet[]
): string {
  if (!outletId) return ALL_BRANCHES_LABEL
  return outlets.find((outlet) => outlet.id === outletId)?.name ?? 'Unknown branch'
}

/** Adds or drops one permission key, never mutating the list it was given. */
export function togglePermission(list: readonly string[], key: StaffPermissionKey): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

/**
 * Native radios rather than the Select primitive: the choice is short, always
 * fully visible, and stays operable by keyboard and by test without pointer
 * emulation.
 */
export function BranchRadioGroup({
  outlets,
  value,
  onChange,
  idPrefix,
}: {
  outlets: readonly StaffOutlet[]
  value: string
  onChange: (outletId: string) => void
  idPrefix: string
}) {
  const options = [{ id: '', name: ALL_BRANCHES_LABEL }, ...outlets]

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.id || 'all'}
          htmlFor={`${idPrefix}-branch-${option.id || 'all'}`}
          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            id={`${idPrefix}-branch-${option.id || 'all'}`}
            name={`${idPrefix}-branch`}
            className="h-4 w-4"
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span className="text-sm font-medium leading-none">{option.name}</span>
        </label>
      ))}
    </div>
  )
}

export const NO_DEFAULT_SCREEN_LABEL = 'No preference'

/**
 * Which screen the merchant app opens this account on.
 *
 * The options are passed in already filtered rather than derived here, because
 * what is on offer depends on permissions that are still being edited in the
 * same form — the caller is the only one holding that pending state.
 *
 * Each input carries an explicit `aria-label` so its accessible name is the
 * screen, not the screen plus its explanation. The description is for the
 * owner reading the form; it would only make the control harder to name.
 */
export function DefaultScreenRadioGroup({
  options,
  value,
  onChange,
  idPrefix,
}: {
  options: readonly DefaultScreenOption[]
  /** '' means no preference — the app decides, as it does today. */
  value: string
  onChange: (tab: string) => void
  idPrefix: string
}) {
  const choices = [
    {
      tab: '',
      label: NO_DEFAULT_SCREEN_LABEL,
      description: 'Open wherever the app normally opens',
    },
    ...options,
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {choices.map((choice) => (
        <label
          key={choice.tab || 'none'}
          htmlFor={`${idPrefix}-screen-${choice.tab || 'none'}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            id={`${idPrefix}-screen-${choice.tab || 'none'}`}
            name={`${idPrefix}-screen`}
            aria-label={choice.label}
            className="mt-0.5 h-4 w-4"
            checked={value === choice.tab}
            onChange={() => onChange(choice.tab)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium leading-none">{choice.label}</span>
            <span className="block text-xs text-muted-foreground">{choice.description}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function PermissionCheckboxes({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: readonly string[]
  onToggle: (key: StaffPermissionKey) => void
  idPrefix: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {STAFF_PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          htmlFor={`${idPrefix}-${key}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
        >
          <Checkbox
            id={`${idPrefix}-${key}`}
            checked={selected.includes(key)}
            onCheckedChange={() => onToggle(key)}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium leading-none">
              {STAFF_PERMISSION_LABELS[key].label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {STAFF_PERMISSION_LABELS[key].description}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
