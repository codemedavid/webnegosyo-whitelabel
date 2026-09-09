/**
 * The cache never outlives the tenant it was filled for.
 *
 * A superadmin switching stores, or anyone signing out, must not see the
 * previous tenant's rows flash before the new fetch lands — and must not leave
 * a realtime channel bound to a tenant nobody is looking at.
 */
import { QueryClient } from "@tanstack/query-core";
import { platformQueryKey, resourceKey } from "../backends/query-keys";
import { dropCacheForOtherTenants } from "./cache-scope";

const ALL = { kind: "all" } as const;

function seed(client: QueryClient) {
  client.setQueryData(platformQueryKey("orders:getOrders", {}, "t1", ALL), ["t1-order"]);
  client.setQueryData(resourceKey("products", "t1"), ["t1-product"]);
  client.setQueryData(platformQueryKey("orders:getOrders", {}, "t2", ALL), ["t2-order"]);
  client.setQueryData(resourceKey("platform-announcements", null), ["global"]);
}

describe("dropCacheForOtherTenants", () => {
  it("removes every other tenant's queries and keeps the current tenant's", () => {
    const client = new QueryClient();
    seed(client);
    const hub = { teardownAll: jest.fn() };

    dropCacheForOtherTenants(client, hub, "t1");

    expect(client.getQueryData(platformQueryKey("orders:getOrders", {}, "t1", ALL))).toEqual(["t1-order"]);
    expect(client.getQueryData(resourceKey("products", "t1"))).toEqual(["t1-product"]);
    expect(client.getQueryData(platformQueryKey("orders:getOrders", {}, "t2", ALL))).toBeUndefined();
    expect(hub.teardownAll).not.toHaveBeenCalled();
  });

  it("leaves tenant-less queries alone", () => {
    const client = new QueryClient();
    seed(client);

    dropCacheForOtherTenants(client, { teardownAll: jest.fn() }, "t1");

    expect(client.getQueryData(resourceKey("platform-announcements", null))).toEqual(["global"]);
  });

  it("drops every tenant's queries and tears the hub down when no tenant is in scope", () => {
    const client = new QueryClient();
    seed(client);
    const hub = { teardownAll: jest.fn() };

    dropCacheForOtherTenants(client, hub, null);

    expect(client.getQueryData(platformQueryKey("orders:getOrders", {}, "t1", ALL))).toBeUndefined();
    expect(client.getQueryData(platformQueryKey("orders:getOrders", {}, "t2", ALL))).toBeUndefined();
    expect(client.getQueryData(resourceKey("products", "t1"))).toBeUndefined();
    expect(client.getQueryData(resourceKey("platform-announcements", null))).toEqual(["global"]);
    expect(hub.teardownAll).toHaveBeenCalledTimes(1);
  });
});
