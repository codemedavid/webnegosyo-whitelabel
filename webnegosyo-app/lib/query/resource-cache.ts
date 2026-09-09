/**
 * Mutation-side helpers over the resource cache.
 *
 * A write elsewhere (a movement, a toggle, a save on a detail screen) tells
 * the cache which NAMED resources it changed; every live copy for that tenant
 * refetches, and a screen mounting later into the cache reads fresh data.
 * `setResourceData` is the optimistic half: patch what is on screen now, and
 * put it back if the write fails. Pure over the query-core client; no React.
 */

import type { QueryClient } from "@tanstack/query-core";
import type { ResourceQueryKey } from "../backends/query-keys";
import { invalidateResource } from "./use-resource";

/** Invalidate several named resources for one tenant in one go. */
export async function invalidateResources(
  client: QueryClient,
  names: readonly string[],
  tenantId: string
): Promise<void> {
  await Promise.all(names.map((name) => invalidateResource(client, name, tenantId)));
}

/**
 * Patch a cached value through `updater`. Returning `undefined` leaves the
 * cache untouched, so a patch against a key nothing has loaded yet is a no-op
 * rather than an entry with no data behind it.
 */
export function setResourceData<T>(
  client: QueryClient,
  key: ResourceQueryKey,
  updater: (previous: T | undefined) => T | undefined
): void {
  client.setQueryData<T>(key, (previous) => updater(previous));
}
