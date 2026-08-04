/**
 * Choosing which tenants a bulk Convex deploy re-pushes.
 *
 * This is a plain function rather than a PostgREST filter because
 * `tenants.convex_schema_version` is a TEXT column. Asking the database for
 * `convex_schema_version.lt.18` compares lexically, and lexically "5" and "9"
 * are both greater than "18". Once head passed version 10, every tenant on a
 * single-digit version fell out of the bulk deploy's result set permanently:
 * the button reported success, updated the tenants it could see, and left the
 * oldest stores — precisely the ones most in need of the push — untouched.
 *
 * A version is compared as a number here, and anything unreadable counts as
 * "never deployed", which errs toward pushing rather than toward skipping.
 */

export interface DeployCandidate {
  id: string;
  convex_schema_version?: string | number | null;
}

/** The recorded version as a number, or null when it cannot be read as one. */
function readVersion(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The subset of `tenants` running a bundle older than `currentVersion`,
 * in the order given.
 *
 * A tenant ahead of this build is left alone: pushing an older bundle over a
 * newer deployment would take working functions away from a live store.
 */
export function tenantsNeedingDeploy<T extends DeployCandidate>(
  tenants: readonly T[],
  currentVersion: number
): T[] {
  return tenants.filter((tenant) => {
    const version = readVersion(tenant.convex_schema_version);
    return version === null || version < currentVersion;
  });
}
