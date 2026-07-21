/**
 * Fail-closed guardrails for the MCP provisioning surface.
 *
 * The remote MCP is superadmin-authenticated and its tools run with a
 * service-role client that bypasses RLS. To keep that authority safe, the
 * provisioning surface is deliberately create/read/update ONLY — it must never
 * be able to delete tenant data or take a tenant offline.
 *
 * These helpers make that guarantee explicit and enforceable (in `executeOp`
 * and in the ops-registry construction) instead of merely incidental, so a
 * destructive op cannot be added or dispatched silently.
 */

/** Standalone verb tokens that mark an op as destructive/irreversible. */
const DESTRUCTIVE_TOKENS = new Set([
  'delete',
  'drop',
  'remove',
  'destroy',
  'deprovision',
  'truncate',
  'purge',
  'wipe',
  'teardown',
  'erase',
])

/**
 * True when an op name contains a destructive verb as a whole snake_case token
 * (e.g. `delete_tenant`, `tenant_delete`). Substrings inside other words
 * (`undelete_recovery`, `dropdown_config`) are NOT flagged — the token must
 * stand alone between word boundaries.
 */
export function isDestructiveOpName(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((token) => DESTRUCTIVE_TOKENS.has(token))
}

/**
 * Throw if `name` implies a destructive operation. Called both when building
 * the ops registry (import-time fail-closed) and before dispatch in
 * `executeOp` (runtime fail-closed), so no delete-style op can ever run.
 */
export function assertNonDestructiveOpName(name: string): void {
  if (isDestructiveOpName(name)) {
    throw new Error(
      `Refusing destructive MCP op "${name}": the provisioning surface is create/read/update only and must never delete tenant data.`,
    )
  }
}

/**
 * Throw if a tenant-update payload would deactivate (soft-delete / take
 * offline) a tenant. Disabling `is_active` is the closest thing to deleting a
 * tenant reachable through the MCP, so it is blocked here — reactivation and
 * every other field remain allowed.
 */
export function assertNoTenantDeactivation(payload: Record<string, unknown>): void {
  if (payload.is_active === false) {
    throw new Error(
      'Refusing to deactivate a tenant via MCP: change is_active only from the superadmin UI.',
    )
  }
}
