/**
 * Mutation-side helpers over the resource cache: invalidate a set of named
 * resources for one tenant, and patch a cached value in place for an
 * optimistic update. Pure over the query-core client; no React.
 */
import { QueryClient } from "@tanstack/query-core";
import { resourceKey } from "../backends/query-keys";
import { invalidateResources, setResourceData } from "./resource-cache";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
});
afterEach(() => client.clear());

describe("invalidateResources", () => {
  it("marks every named resource of the tenant stale and leaves the rest alone", async () => {
    client.setQueryData(resourceKey("shelf", "t1", "o1"), ["a"]);
    client.setQueryData(resourceKey("count", "t1", "pool"), { id: "c" });
    client.setQueryData(resourceKey("shelf", "t2"), ["b"]);
    client.setQueryData(resourceKey("outlets", "t1"), ["o"]);

    await invalidateResources(client, ["shelf", "count"], "t1");

    expect(client.getQueryState(resourceKey("shelf", "t1", "o1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(resourceKey("count", "t1", "pool"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(resourceKey("shelf", "t2"))?.isInvalidated).toBe(false);
    expect(client.getQueryState(resourceKey("outlets", "t1"))?.isInvalidated).toBe(false);
  });
});

describe("setResourceData", () => {
  it("replaces the cached value through the updater", () => {
    const key = resourceKey("methods", "t1");
    client.setQueryData(key, [{ id: "m1", on: false }]);

    setResourceData<{ id: string; on: boolean }[]>(client, key, (prev) =>
      (prev ?? []).map((m) => (m.id === "m1" ? { ...m, on: true } : m))
    );

    expect(client.getQueryData(key)).toEqual([{ id: "m1", on: true }]);
  });

  it("does nothing when nothing is cached yet", () => {
    const key = resourceKey("methods", "t1");
    setResourceData<string[]>(client, key, (prev) => prev && [...prev, "x"]);
    expect(client.getQueryData(key)).toBeUndefined();
  });
});
