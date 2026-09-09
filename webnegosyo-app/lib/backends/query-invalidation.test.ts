/**
 * Which cached queries an order change refreshes.
 *
 * Real-time latency must not regress: an in-scope payload has to refetch every
 * ACTIVE realtime-backed key of that tenant immediately. And because one
 * channel per tenant is now shared, the branch check moves from the channel to
 * the key — a store-wide alerts watcher and a branch-scoped kitchen board sit on
 * the same socket and must each get only the changes they may see.
 */
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import {
  invalidateForOrderChange,
  invalidatePlatformQueries,
  isQueryAffectedByOrderChange,
} from "./query-invalidation";
import { platformQueryKey, resourceKey } from "./query-keys";
import type { OrderChangePayload } from "./supabase-realtime";
import type { BranchScope } from "../branch-scope";

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "north" };
const SOUTH: BranchScope = { kind: "branch", outletId: "south" };

const northSale: OrderChangePayload = { new: { tenant_id: "t1", outlet_id: "north" } };

describe("isQueryAffectedByOrderChange", () => {
  it("affects a realtime-backed key of the same tenant in scope", () => {
    const key = platformQueryKey("orders:getOrders", {}, "t1", ALL);
    expect(isQueryAffectedByOrderChange(key, "t1", northSale)).toBe(true);
  });

  it("ignores analytics refs that are not realtime-backed", () => {
    const key = platformQueryKey("analytics:getTopItems", { daysBack: 7 }, "t1", ALL);
    expect(isQueryAffectedByOrderChange(key, "t1", northSale)).toBe(false);
  });

  it("ignores another tenant's key", () => {
    const key = platformQueryKey("orders:getOrders", {}, "t2", ALL);
    expect(isQueryAffectedByOrderChange(key, "t1", northSale)).toBe(false);
  });

  it("ignores a key scoped to another branch", () => {
    const key = platformQueryKey("orders:getOrders", {}, "t1", SOUTH);
    expect(isQueryAffectedByOrderChange(key, "t1", northSale)).toBe(false);
  });

  it("affects a key scoped to the branch that took the order", () => {
    const key = platformQueryKey("orders:getOrders", {}, "t1", NORTH);
    expect(isQueryAffectedByOrderChange(key, "t1", northSale)).toBe(true);
  });

  it("ignores resource keys and the skip sentinel", () => {
    expect(isQueryAffectedByOrderChange(resourceKey("products", "t1"), "t1", northSale)).toBe(false);
    expect(isQueryAffectedByOrderChange(["platform", "skip"], "t1", northSale)).toBe(false);
  });
});

/** An observed (active) query whose fetches can be counted. */
function observe(client: QueryClient, queryKey: readonly unknown[]) {
  const queryFn = jest.fn(async () => "data");
  const observer = new QueryObserver(client, { queryKey, queryFn, staleTime: 60_000 });
  const unsubscribe = observer.subscribe(() => {});
  return { queryFn, unsubscribe };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("invalidateForOrderChange", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => client.clear());

  it("refetches exactly the realtime-backed active keys of that tenant", async () => {
    const orders = observe(client, platformQueryKey("orders:getOrders", {}, "t1", ALL));
    const items = observe(client, platformQueryKey("orders:getAllOrderItems", {}, "t1", ALL));
    const analytics = observe(client, platformQueryKey("analytics:getTopItems", {}, "t1", ALL));
    const otherTenant = observe(client, platformQueryKey("orders:getOrders", {}, "t2", ALL));
    await flush();
    expect(orders.queryFn).toHaveBeenCalledTimes(1);

    await invalidateForOrderChange(client, "t1", northSale);

    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    expect(items.queryFn).toHaveBeenCalledTimes(2);
    expect(analytics.queryFn).toHaveBeenCalledTimes(1);
    expect(otherTenant.queryFn).toHaveBeenCalledTimes(1);
  });

  it("skips branch keys for another branch's sale but not the store-wide key", async () => {
    const storeWide = observe(client, platformQueryKey("orders:getOrders", {}, "t1", ALL));
    const north = observe(client, platformQueryKey("orders:getOrders", {}, "t1", NORTH));
    const south = observe(client, platformQueryKey("orders:getOrders", {}, "t1", SOUTH));
    await flush();

    await invalidateForOrderChange(client, "t1", northSale);

    expect(storeWide.queryFn).toHaveBeenCalledTimes(2);
    expect(north.queryFn).toHaveBeenCalledTimes(2);
    expect(south.queryFn).toHaveBeenCalledTimes(1);
  });

  it("marks an inactive key stale without fetching it", async () => {
    const orders = observe(client, platformQueryKey("orders:getOrders", {}, "t1", ALL));
    await flush();
    orders.unsubscribe();

    await invalidateForOrderChange(client, "t1", northSale);

    expect(orders.queryFn).toHaveBeenCalledTimes(1);
    const state = client.getQueryState(platformQueryKey("orders:getOrders", {}, "t1", ALL));
    expect(state?.isInvalidated).toBe(true);
  });
});

describe("invalidatePlatformQueries", () => {
  it("refetches every active platform key of the tenant, realtime-backed or not", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const orders = observe(client, platformQueryKey("orders:getOrders", {}, "t1", ALL));
    const analytics = observe(client, platformQueryKey("analytics:getTopItems", {}, "t1", ALL));
    const otherTenant = observe(client, platformQueryKey("orders:getOrders", {}, "t2", ALL));
    const resource = observe(client, resourceKey("products", "t1"));
    await flush();

    await invalidatePlatformQueries(client, "t1");

    expect(orders.queryFn).toHaveBeenCalledTimes(2);
    expect(analytics.queryFn).toHaveBeenCalledTimes(2);
    expect(otherTenant.queryFn).toHaveBeenCalledTimes(1);
    expect(resource.queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
