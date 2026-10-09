/**
 * "Show me the branches again" — once per page load.
 *
 * A customer who already picked a branch should see the list again when they
 * refresh or come back (their branch marked current), but NOT every time the
 * menu remounts during client-side navigation (menu → cart → menu). Module
 * state is exactly that lifetime: a full reload re-evaluates the module, a
 * client navigation does not.
 */

let hasClaimed = false

/** True for the first caller in this page load, false for every later one. */
export function claimBranchRevisit(): boolean {
  if (hasClaimed) return false
  hasClaimed = true
  return true
}

export function resetBranchRevisitForTests(): void {
  hasClaimed = false
}

export interface BranchRevisitInput {
  /** A valid remembered branch is being served without asking. */
  hasRememberedOutlet: boolean
  /** The picker is already up for another reason (no choice yet, stale choice). */
  isAlreadyPrompting: boolean
  /** A `?outlet=` link named the branch — the link is the answer. */
  hasOutletLink: boolean
  /** A table QR: the customer is seated at a branch, not choosing one. */
  hasTableLink: boolean
}

export function shouldOfferBranchRevisit(input: BranchRevisitInput): boolean {
  return (
    input.hasRememberedOutlet &&
    !input.isAlreadyPrompting &&
    !input.hasOutletLink &&
    !input.hasTableLink
  )
}
