/**
 * The one place a realtime payload becomes a cache invalidation.
 *
 * With one channel per tenant, ONE listener per query client must translate a
 * payload into `invalidateQueries`. N listeners would issue N invalidations,
 * each cancelling and restarting the previous refetch — N round trips for one
 * order. So the binding is ref-counted per client: every platform hook binds,
 * the first registers the listener, the last release removes it.
 *
 * Payloads are coalesced for `REALTIME_COALESCE_MS` and answered with ONE
 * invalidation covering every key any of them touches. One sale arrives as an
 * INSERT plus the UPDATEs its triggers write, and a busy store's events land
 * back to back; per payload, every order key was refetched several times a
 * second, each refetch cancelling the one before it.
 *
 * Takes the hub slice and the client so tests bind fakes; the singletons are
 * supplied by `use-platform-query.ts`.
 */

import type { QueryClient } from "@tanstack/query-core";
import { invalidateForOrderChanges } from "../backends/query-invalidation";
import type { OrderChangeEvent, OrderChangeListener } from "../backends/realtime-hub";

export interface RealtimeChangeSource {
  onChange: (listener: OrderChangeListener) => () => void;
}

interface Binding {
  holders: number;
  unsubscribe: () => void;
}

/**
 * How long payloads gather before one invalidation answers them all. Short
 * enough that a new order still reaches the board within a second; long
 * enough to fold a sale's INSERT and its trigger UPDATEs into one read.
 */
export const REALTIME_COALESCE_MS = 400;

const bindings = new WeakMap<QueryClient, Binding>();

function subscribe(source: RealtimeChangeSource, client: QueryClient): () => void {
  let pending: readonly OrderChangeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    invalidateForOrderChanges(client, batch).catch((e: unknown) => {
      console.warn("[realtime-bridge] invalidation failed:", e);
    });
  };

  const unsubscribe = source.onChange((event) => {
    pending = [...pending, event];
    if (timer === null) timer = setTimeout(flush, REALTIME_COALESCE_MS);
  });

  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = [];
  };
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
