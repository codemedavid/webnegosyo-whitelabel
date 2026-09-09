/**
 * The one place a realtime payload becomes a cache invalidation.
 *
 * With one channel per tenant, ONE listener per query client must translate a
 * payload into `invalidateQueries`. N listeners would issue N invalidations,
 * each cancelling and restarting the previous refetch — N round trips for one
 * order. So the binding is ref-counted per client: every platform hook binds,
 * the first registers the listener, the last release removes it.
 *
 * Takes the hub slice and the client so tests bind fakes; the singletons are
 * supplied by `use-platform-query.ts`.
 */

import type { QueryClient } from "@tanstack/query-core";
import { invalidateForOrderChange } from "../backends/query-invalidation";
import type { OrderChangeListener } from "../backends/realtime-hub";

export interface RealtimeChangeSource {
  onChange: (listener: OrderChangeListener) => () => void;
}

interface Binding {
  holders: number;
  unsubscribe: () => void;
}

const bindings = new WeakMap<QueryClient, Binding>();

function subscribe(source: RealtimeChangeSource, client: QueryClient): () => void {
  return source.onChange(({ tenantId, payload }) => {
    invalidateForOrderChange(client, tenantId, payload).catch((e: unknown) => {
      console.warn("[realtime-bridge] invalidation failed:", e);
    });
  });
}

/** Bind a client to the hub; returns this holder's release. */
export function bindRealtimeToQueryClient(
  source: RealtimeChangeSource,
  client: QueryClient
): () => void {
  const existing = bindings.get(client);
  const binding: Binding = existing
    ? { ...existing, holders: existing.holders + 1 }
    : { holders: 1, unsubscribe: subscribe(source, client) };
  bindings.set(client, binding);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = bindings.get(client);
    if (!current) return;
    if (current.holders <= 1) {
      current.unsubscribe();
      bindings.delete(client);
      return;
    }
    bindings.set(client, { ...current, holders: current.holders - 1 });
  };
}
