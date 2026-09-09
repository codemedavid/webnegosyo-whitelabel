/**
 * Query identity for the shared cache.
 *
 * Two hook instances asking the same question must land on the same cache
 * entry, so the key is built from VALUES (ref, args, tenant, scope) and never
 * from object identity. Screens pass fresh arg literals every render.
 */
import {
  SKIPPED_PLATFORM_KEY,
  branchScopeKey,
  isPlatformKey,
  keyTenant,
  parseBranchScopeKey,
  platformKeyRef,
  platformKeyScope,
  platformQueryKey,
  resourceKey,
} from "./query-keys";

describe("platformQueryKey", () => {
  it("is equal for equal values regardless of object identity", () => {
    const a = platformQueryKey("orders:getOrders", { limit: 200 }, "t1", { kind: "all" });
    const b = platformQueryKey("orders:getOrders", { limit: 200 }, "t1", { kind: "all" });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("normalises undefined args to an empty object", () => {
    expect(platformQueryKey("orders:getOrders", undefined, "t1", { kind: "all" })).toEqual(
      platformQueryKey("orders:getOrders", {}, "t1", { kind: "all" })
    );
  });

  it("drops undefined-valued args so `{ limit: undefined }` matches `{}`", () => {
    expect(platformQueryKey("r", { limit: undefined }, "t1", { kind: "all" })).toEqual(
      platformQueryKey("r", {}, "t1", { kind: "all" })
    );
  });

  it("differs by ref, args, tenant and scope", () => {
    const base = platformQueryKey("r", { a: 1 }, "t1", { kind: "all" });
    expect(platformQueryKey("s", { a: 1 }, "t1", { kind: "all" })).not.toEqual(base);
    expect(platformQueryKey("r", { a: 2 }, "t1", { kind: "all" })).not.toEqual(base);
    expect(platformQueryKey("r", { a: 1 }, "t2", { kind: "all" })).not.toEqual(base);
    expect(
      platformQueryKey("r", { a: 1 }, "t1", { kind: "branch", outletId: "o1" })
    ).not.toEqual(base);
  });

  it("exposes tenant, ref and scope back off the key", () => {
    const key = platformQueryKey("orders:getOrders", {}, "t1", {
      kind: "branch",
      outletId: "o1",
    });
    expect(isPlatformKey(key)).toBe(true);
    expect(keyTenant(key)).toBe("t1");
    expect(platformKeyRef(key)).toBe("orders:getOrders");
    expect(platformKeyScope(key)).toEqual({ kind: "branch", outletId: "o1" });
  });

  it("does not mistake the skip sentinel or a resource key for a platform key", () => {
    expect(isPlatformKey(SKIPPED_PLATFORM_KEY)).toBe(false);
    expect(keyTenant(SKIPPED_PLATFORM_KEY)).toBeNull();
    expect(isPlatformKey(resourceKey("products", "t1"))).toBe(false);
  });
});

describe("resourceKey", () => {
  it("carries the tenant in a readable position", () => {
    const key = resourceKey("products", "t1", "outlet-9");
    expect(keyTenant(key)).toBe("t1");
    expect(key).toEqual(["resource", "products", "t1", "outlet-9"]);
  });

  it("reads null for a resource without a tenant", () => {
    expect(keyTenant(resourceKey("platform-announcements", null))).toBeNull();
  });
});

describe("branch scope key round-trip", () => {
  it("serialises and parses both scope kinds", () => {
    expect(parseBranchScopeKey(branchScopeKey({ kind: "all" }))).toEqual({ kind: "all" });
    expect(parseBranchScopeKey(branchScopeKey({ kind: "branch", outletId: "o:1" }))).toEqual({
      kind: "branch",
      outletId: "o:1",
    });
  });
});
