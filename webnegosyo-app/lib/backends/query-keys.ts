/**
 * Query identity for the shared cache.
 *
 * Two hook instances asking the same question must share one cache entry and
 * one in-flight fetch, so a key is built from VALUES only — the ref, the
 * normalised args, the tenant and the branch scope. Screens pass fresh arg
 * literals every render; nothing here depends on object identity.
 *
 * The tenant and the scope sit at fixed positions so invalidation and the
 * tenant-switch teardown can read them straight back off a key without a
 * lookup table. Pure module: no React, no client.
 */

import type { BranchScope } from "../branch-scope";

export const PLATFORM_KEY_ROOT = "platform";
export const RESOURCE_KEY_ROOT = "resource";

const PLATFORM_KEY_LENGTH = 5;
const PLATFORM_KEY_TENANT_INDEX = 3;
const RESOURCE_KEY_TENANT_INDEX = 2;

export type PlatformQueryKey = readonly [
  typeof PLATFORM_KEY_ROOT,
  string,
  Record<string, unknown>,
  string,
  BranchScope,
];

export type ResourceQueryKey = readonly [typeof RESOURCE_KEY_ROOT, string, string | null, ...unknown[]];

/**
 * The key a skipped platform query sits on. Never fetched: the hook disables
 * the query and guards `refetch`, so many skipped hooks sharing it is harmless.
 */
export const SKIPPED_PLATFORM_KEY = [PLATFORM_KEY_ROOT, "skip"] as const;

/** Drops undefined-valued entries so `{ limit: undefined }` and `{}` are one key. */
function normalizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};
  return JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
}

export function platformQueryKey(
  refName: string,
  args: Record<string, unknown> | undefined,
  tenantId: string,
  scope: BranchScope
): PlatformQueryKey {
  return [PLATFORM_KEY_ROOT, refName, normalizeArgs(args), tenantId, scope];
}

/** A key for an imperative service read (products, inventory, outlets…). */
export function resourceKey(
  name: string,
  tenantId: string | null,
  ...params: readonly unknown[]
): ResourceQueryKey {
  return [RESOURCE_KEY_ROOT, name, tenantId, ...params];
}

export function isPlatformKey(key: readonly unknown[]): key is PlatformQueryKey {
  return key[0] === PLATFORM_KEY_ROOT && key.length === PLATFORM_KEY_LENGTH;
}

function isResourceKey(key: readonly unknown[]): key is ResourceQueryKey {
  return key[0] === RESOURCE_KEY_ROOT && key.length >= 3;
}

/** The tenant a key belongs to; null for tenant-less or unrecognised keys. */
export function keyTenant(key: readonly unknown[]): string | null {
  if (isPlatformKey(key)) return key[PLATFORM_KEY_TENANT_INDEX];
  if (isResourceKey(key)) {
    const tenant = key[RESOURCE_KEY_TENANT_INDEX];
    return typeof tenant === "string" ? tenant : null;
  }
  return null;
}

export function platformKeyRef(key: PlatformQueryKey): string {
  return key[1];
}

export function platformKeyScope(key: PlatformQueryKey): BranchScope {
  return key[4];
}

const BRANCH_SCOPE_PREFIX = "branch:";

/** A value key for a scope, so hooks can depend on the scope by value. */
export function branchScopeKey(scope: BranchScope): string {
  return scope.kind === "all" ? "all" : `${BRANCH_SCOPE_PREFIX}${scope.outletId}`;
}

export function parseBranchScopeKey(scopeKey: string): BranchScope {
  if (!scopeKey.startsWith(BRANCH_SCOPE_PREFIX)) return { kind: "all" };
  return { kind: "branch", outletId: scopeKey.slice(BRANCH_SCOPE_PREFIX.length) };
}
