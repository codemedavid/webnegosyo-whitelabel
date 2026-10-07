import {
  RESOURCE_KEY_ROOT,
  branchScopeKey,
  isPlatformKey,
  keyTenant,
  platformKeyScope,
} from "../backends/query-keys";

/**
 * Placeholder data lives on the observer, independently of cache eviction.
 * Keep it only when the resource, tenant, and (for platform reads) branch
 * still match. Query arguments may change within that identity.
 */
export function canKeepPreviousData(
  current: readonly unknown[] | null,
  previous: readonly unknown[] | undefined
): boolean {
  if (!current || !previous || current[0] !== previous[0] || current[1] !== previous[1]) return false;

  const tenantId = keyTenant(current);
  if (tenantId === null || tenantId !== keyTenant(previous)) return false;

  if (isPlatformKey(current) && isPlatformKey(previous)) {
    return branchScopeKey(platformKeyScope(current)) === branchScopeKey(platformKeyScope(previous));
  }

  return current[0] === RESOURCE_KEY_ROOT;
}
