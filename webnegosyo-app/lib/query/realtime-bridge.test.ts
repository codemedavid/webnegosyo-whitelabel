/**
 * The one place a realtime payload becomes a cache invalidation.
 *
 * Every platform hook instance used to own its own channel callback. With one
 * channel per tenant, ONE listener per query client must translate a payload
 * into `invalidateQueries` — N listeners would issue N invalidations, each
 * cancelling and restarting the previous refetch.
 */
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { platformQueryKey } from "../backends/query-keys";
import type { OrderChangeEvent, OrderChangeListener } from "../backends/realtime-hub";
import { bindRealtimeToQueryClient } from "./realtime-bridge";

function fakeHub() {
  const listeners = new Set<OrderChangeListener>();
  return {
    listeners,
    hub: {
      onChange: (listener: OrderChangeListener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    emit: (event: OrderChangeEvent) => listeners.forEach((l) => l(event)),
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("bindRealtimeToQueryClient", () => {
  it("registers one hub listener however many hooks bind the same client", () => {
    const { hub, listeners } = fakeHub();
    const client = new QueryClient();

    const unbindA = bindRealtimeToQueryClient(hub, client);
    const unbindB = bindRealtimeToQueryClient(hub, client);
    expect(listeners.size).toBe(1);

    unbindA();
    expect(listeners.size).toBe(1);
    unbindB();
    expect(listeners.size).toBe(0);
  });

  it("keeps separate clients separate", () => {
    const { hub, listeners } = fakeHub();
    bindRealtimeToQueryClient(hub, new QueryClient());
    bindRealtimeToQueryClient(hub, new QueryClient());
    expect(listeners.size).toBe(2);
  });

  it("refetches the affected active key once per payload", async () => {
    const { hub, emit } = fakeHub();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = jest.fn(async () => []);
    const observer = new QueryObserver(client, {
      queryKey: platformQueryKey("orders:getOrders", {}, "t1", { kind: "all" }),
      queryFn,
      staleTime: 60_000,
    });
    observer.subscribe(() => {});
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    bindRealtimeToQueryClient(hub, client);
    bindRealtimeToQueryClient(hub, client);
    emit({ tenantId: "t1", payload: { new: { tenant_id: "t1" } } });
    await flush();

    expect(queryFn).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
