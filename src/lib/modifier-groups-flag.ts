/**
 * The modifier-groups feature flag (multi-select option groups with min/max
 * picks).
 *
 * Unlike most per-tenant flags this one is ON by default: every store runs on
 * option groups, and the legacy variations/add-ons editor is only for a store
 * someone deliberately switched off. So a missing or null value reads as on —
 * a projection that forgets the column, or an edit that omits it, must never
 * quietly drop a store back to the editor without multiple options.
 *
 * Pure and dependency-free so the server pages and the client sheet agree.
 */

/** The subset of tenant columns this module needs. */
export interface ModifierGroupsTenantFields {
  modifier_groups_enabled?: boolean | null
}

/** Whether a tenant uses modifier groups. Only an explicit `false` is off. */
export function isModifierGroupsEnabled(
  tenant: ModifierGroupsTenantFields | null | undefined,
): boolean {
  return tenant?.modifier_groups_enabled !== false
}
