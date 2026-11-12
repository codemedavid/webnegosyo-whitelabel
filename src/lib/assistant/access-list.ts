/**
 * "Who can use Owl" — the owner's switch per staff account (opt-in key
 * `assistant`, 2026-11-12). Pure, so the list arithmetic is testable: the
 * switch sends the account's WHOLE permission list through the normal staff
 * writer (updateStaffPermissionsAction), so a wrong list here would grant or
 * revoke far more than Owl.
 */

import { STAFF_PERMISSION_KEYS, hasPermission, isGrantedByFullAccess } from '@/lib/staff-permissions'

const KEY = 'assistant'

/**
 * The list to save after flipping Owl for an account. A legacy full-access
 * account (`null`) expands to what full access REALLY grants (every key but
 * the opt-in ones), so switching Owl on never also hands out Expenses, Cash
 * or Approvals; a stored list keeps every key it has, unknown ones included.
 */
export function withOwlAccess(permissions: readonly string[] | null, allowed: boolean): string[] {
  const base = permissions === null ? STAFF_PERMISSION_KEYS.filter(isGrantedByFullAccess) : [...permissions]
  const without = base.filter((key) => key !== KEY)
  return allowed ? [...without, KEY] : without
}

export interface OwlAccessStaffInput {
  user_id: string
  is_owner: boolean
  role: string
  outlet_id?: string | null
  permissions: string[] | null
  display_name: string | null
  email: string | null
}

export interface OwlAccessRow {
  userId: string
  name: string
  hasOwl: boolean
  /** Branch-locked accounts are refused by Owl for now, whatever the switch says. */
  isBranchLocked: boolean
  permissions: string[] | null
}

/** Staff rows for the sheet: owners left out (they always have Owl), by name. */
export function owlAccessRows(staff: readonly OwlAccessStaffInput[]): OwlAccessRow[] {
  return staff
    .filter((member) => member.is_owner !== true)
    .map((member) => ({
      userId: member.user_id,
      name: member.display_name?.trim() || member.email?.trim() || 'Staff account',
      hasOwl: hasPermission({ role: member.role, is_owner: false, permissions: member.permissions }, KEY),
      isBranchLocked: Boolean(member.outlet_id),
      permissions: member.permissions,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
