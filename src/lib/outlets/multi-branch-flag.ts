/**
 * The multi-branch feature flag, and the one question the storefront actually
 * asks of it.
 *
 * Every tenant row in production predates the `multi_branch_enabled` column, so
 * the absent value is the common case and it MUST read as off. Nothing here
 * coerces: only a real `true` turns the feature on, because a stray string from
 * an untyped write path switching a live storefront into a different ordering
 * flow is exactly the failure this feature cannot have.
 *
 * Pure and dependency-free so both the server render and the client overlay
 * reach the same verdict.
 */

/** The subset of tenant columns this module needs. */
export interface MultiBranchTenantFields {
  multi_branch_enabled?: boolean | null
}

/** The subset of an outlet this module needs to count what is choosable. */
interface CountableOutlet {
  is_active: boolean
}

/**
 * Whether multi-branch behaviour is enabled for a tenant.
 *
 * Missing, null, or any non-boolean value is off.
 */
export function isMultiBranchEnabled(
  tenant: MultiBranchTenantFields | null | undefined
): boolean {
  return tenant?.multi_branch_enabled === true
}

/**
 * Whether the customer should be asked to choose an outlet.
 *
 * A tenant with the flag on but zero or one active outlet behaves exactly like
 * a single-location tenant — no splash, no picker, no extra step. That is a
 * hard requirement, not an optimization: merchants get switched on before they
 * finish configuring, and their storefront must not break in between.
 */
export function shouldPromptOutletSelection(
  tenant: MultiBranchTenantFields | null | undefined,
  outlets: readonly CountableOutlet[]
): boolean {
  if (!isMultiBranchEnabled(tenant)) return false
  return outlets.filter((outlet) => outlet.is_active).length >= 2
}
