/**
 * How a branch is named on screen, and the shape the staff surfaces need.
 *
 * Lives in `lib` rather than beside the form controls because both halves of
 * the app need it: the client pickers, and the server-rendered profile and
 * shift history. A plain function exported from a `'use client'` module
 * becomes a client reference when a Server Component imports it — calling it
 * during the server render throws — so the rule is that anything a server
 * page might call cannot live in a client file.
 */

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
