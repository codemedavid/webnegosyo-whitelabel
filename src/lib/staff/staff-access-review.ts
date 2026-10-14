/**
 * "Review staff access": a one-time prompt for owners whose store still has
 * staff on legacy full access (`permissions: null`).
 *
 * Null predates staff management and means "every key", so the day Sales
 * Reports and Costs & Profit appear, those accounts can see the store's sales
 * and margins without the owner having chosen that. Nothing is taken away
 * automatically (silently locking a manager out mid-shift is worse); the owner
 * is asked once, and the prompt goes away by itself when no such account is
 * left. Pure, so the server nudge and its tests share one rule.
 */

import { canManageStaff, type PermissionHolder } from '@/lib/staff-permissions'

export interface StaffReviewRow {
  user_id: string
  role: string
  is_owner: boolean | null
  permissions: string[] | null
  display_name: string | null
  email: string | null
}

export interface StaffToReview {
  userId: string
  name: string
}

export interface ReviewCaller extends PermissionHolder {
  tenant_id: string | null
}

const UNNAMED_STAFF = 'A staff member'

function nameOf(row: StaffReviewRow): string {
  const display = row.display_name?.trim()
  if (display) return display
  const local = row.email?.split('@')[0]?.trim()
  return local || UNNAMED_STAFF
}

/** Non-owner staff accounts still on legacy full access. */
export function staffNeedingReview(rows: readonly StaffReviewRow[]): StaffToReview[] {
  return rows
    .filter((row) => row.role === 'admin' && row.is_owner !== true && row.permissions === null)
    .map((row) => ({ userId: row.user_id, name: nameOf(row) }))
}

/** Only someone who may change staff access is asked to review it. */
export function shouldOfferStaffReview(caller: ReviewCaller | null, tenantId: string): boolean {
  if (!caller || !canManageStaff(caller)) return false
  return caller.role === 'superadmin' || caller.tenant_id === tenantId
}

/** One account: straight to its profile. Several: the team list. */
export function reviewHref(tenantSlug: string, people: readonly StaffToReview[]): string {
  const base = `/${tenantSlug}/admin/staff`
  return people.length === 1 ? `${base}/${encodeURIComponent(people[0].userId)}` : base
}

export function reviewMessage(people: readonly StaffToReview[]): { title: string; detail: string } {
  const who = people.length === 1 ? people[0].name : `${people.length} staff accounts`
  return {
    title: `${who} can see everything, including sales and costs`,
    detail:
      'Their access was set before Sales Reports, Inventory and Costs & Profit existed, so it includes all three. Choose what each person needs.',
  }
}

/** Per store: dismissing the prompt for one store never hides it for another. */
export function reviewDismissKey(tenantId: string): string {
  return `wn:staff-access-review-dismissed:${tenantId}`
}
