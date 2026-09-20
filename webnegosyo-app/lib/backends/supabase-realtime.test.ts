import {
  DISCONNECTED_POLL_MS,
  MAX_FAILURE_POLL_MS,
  REALTIME_FALLBACK_POLL_MS,
  buildOrderSubscription,
  isOrderChangeForTenant,
  isOrderChangeInScope,
  isRefRealtimeBacked,
  NO_FAILURES,
  countConsecutiveFailures,
  resolvePollMs,
  resolveRealtimeStatus,
} from "./supabase-realtime";
import type { BranchScope } from "../branch-scope";

/**
 * The platform backend has no push channel of its own — Convex streams changes,
 * Postgres does not. These are the pure decisions behind the mobile realtime
 * subscription, kept out of `lib/hooks.ts` so the parts that decide WHAT we
 * listen to and WHEN we fall back to polling are provable without a React tree
 * or a live socket.
 */

describe("buildOrderSubscription", () => {
  it("scopes the subscription to a single tenant's orders", () => {
    // Arrange / Act
    const subscription = buildOrderSubscription("tenant-1");

    // Assert: the server-side filter is the first line of defence. Without it
    // every merchant's socket would receive every other merchant's orders,
    // including customer names and phone numbers.
    expect(subscription.binding.filter).toBe("tenant_id=eq.tenant-1");
    expect(subscription.binding.table).toBe("orders");
    expect(subscription.binding.schema).toBe("public");
  });

  it("listens for updates as well as inserts", () => {
    // Arrange: a status change made on the web admin or another device must
    // reach this device too, not just brand-new orders.
    const subscription = buildOrderSubscription("tenant-1");

    // Assert
    expect(subscription.binding.event).toBe("*");
  });

  it("gives two subscribers on the same tenant distinct channel names", () => {
    // Arrange: <GlobalOrderAlerts> and the dashboard both watch the queue at
    // once. supabase-js keys channels by topic, so a shared name would make the
    // second subscriber collide with the first instead of getting its own.
    const alerts = buildOrderSubscription("tenant-1", "alerts");
    const dashboard = buildOrderSubscription("tenant-1", "dashboard");

    // Assert
    expect(alerts.channelName).not.toBe(dashboard.channelName);
    expect(alerts.binding.filter).toBe(dashboard.binding.filter);
  });

  it("gives each tenant its own channel name", () => {
    // Arrange: switching stores must not reuse a channel still bound to the
    // previous tenant's filter.
    const first = buildOrderSubscription("tenant-1");
    const second = buildOrderSubscription("tenant-2");

    // Assert
    expect(first.channelName).not.toBe(second.channelName);
    expect(first.channelName).toContain("tenant-1");
  });
});

describe("isOrderChangeForTenant", () => {
  it("accepts a change belonging to the subscribed tenant", () => {
    // Act
    const isMine = isOrderChangeForTenant({ new: { tenant_id: "tenant-1" } }, "tenant-1");

    // Assert
    expect(isMine).toBe(true);
  });

  it("rejects a change belonging to another tenant", () => {
    // Arrange: defence in depth. If the server-side filter is ever dropped or
    // misconfigured, a foreign row must still not refresh this merchant's
    // screen — a refetch is scoped by tenant anyway, but an alert sound fired
    // for someone else's order is a visible cross-tenant leak.
    const isMine = isOrderChangeForTenant({ new: { tenant_id: "tenant-2" } }, "tenant-1");

    // Assert
    expect(isMine).toBe(false);
  });

  it("reads the tenant from the old row on a delete", () => {
    // Arrange: DELETE payloads carry `old`, not `new`.
    const isMine = isOrderChangeForTenant({ old: { tenant_id: "tenant-1" } }, "tenant-1");

    // Assert
    expect(isMine).toBe(true);
  });

  it("rejects a payload with no tenant on either row", () => {
    // Arrange: `replica identity full` should always give us the columns, but a
    // payload we cannot attribute must not be trusted.
    const isMine = isOrderChangeForTenant({}, "tenant-1");

    // Assert
    expect(isMine).toBe(false);
  });
});

/**
 * Supabase Realtime accepts exactly ONE filter clause per binding, so the
 * server-side filter stays on `tenant_id` and the branch is checked when the
 * payload lands. That is not a shortcut: a manager whose screen refetched — or
 * whose device chimed — for a sale at another branch would learn that the sale
 * happened, which is the leak the read scoping exists to close.
 */
describe("isOrderChangeInScope", () => {
  const BRANCH: BranchScope = { kind: "branch", outletId: "outlet-north" };
  const ALL: BranchScope = { kind: "all" };

  it("accepts a change at the account's own branch", () => {
    // Act
    const inScope = isOrderChangeInScope(
      { new: { tenant_id: "tenant-1", outlet_id: "outlet-north" } },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(true);
  });

  it("rejects a change at another branch", () => {
    // Act
    const inScope = isOrderChangeInScope(
      { new: { tenant_id: "tenant-1", outlet_id: "outlet-south" } },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(false);
  });

  it("rejects an unattributed order for a branch account", () => {
    // Arrange: matches `isOrderInScope` — an order belonging to no branch was
    // not taken by this one. Client and server must agree, or the queue count
    // and the queue contents disagree.
    const inScope = isOrderChangeInScope(
      { new: { tenant_id: "tenant-1", outlet_id: null } },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(false);
  });

  it("reads the branch from the old row on a delete", () => {
    // Act
    const inScope = isOrderChangeInScope(
      { old: { tenant_id: "tenant-1", outlet_id: "outlet-north" } },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(true);
  });

  it("falls back to the branch in customer_data when the column is empty", () => {
    // Arrange: the other backends have no column, and a platform row written
    // before the backfill carries the branch only in the blob.
    const inScope = isOrderChangeInScope(
      {
        new: {
          tenant_id: "tenant-1",
          outlet_id: null,
          customer_data: { outlet_id: "outlet-north" },
        },
      },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(true);
  });

  it("accepts every branch for a store-wide account", () => {
    // Act
    const inScope = isOrderChangeInScope(
      { new: { tenant_id: "tenant-1", outlet_id: "outlet-south" } },
      "tenant-1",
      ALL
    );

    // Assert
    expect(inScope).toBe(true);
  });

  it("still rejects another tenant's change, whatever the branch says", () => {
    // Arrange: the tenant check is not replaced by the branch check.
    const inScope = isOrderChangeInScope(
      { new: { tenant_id: "tenant-2", outlet_id: "outlet-north" } },
      "tenant-1",
      BRANCH
    );

    // Assert
    expect(inScope).toBe(false);
  });
});

describe("resolveRealtimeStatus", () => {
  it("treats a subscribed channel as connected", () => {
    expect(resolveRealtimeStatus("SUBSCRIBED")).toBe("connected");
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "treats %s as disconnected so polling takes over",
    (status) => {
      expect(resolveRealtimeStatus(status)).toBe("disconnected");
    }
  );

  it("treats an unrecognized status as disconnected", () => {
    // Arrange: unknown means unproven. Assuming "connected" would silently slow
    // the poll to the safety-net interval and orders would appear a minute late.
    expect(resolveRealtimeStatus("SOMETHING_NEW")).toBe("disconnected");
  });
});

describe("resolvePollMs", () => {
  it("polls slowly while realtime is delivering", () => {
    // Act
    const interval = resolvePollMs("connected");

    // Assert: realtime is the primary path; the poll is only a safety net for a
    // dropped socket the client never noticed.
    expect(interval).toBe(REALTIME_FALLBACK_POLL_MS);
    expect(REALTIME_FALLBACK_POLL_MS).toBeGreaterThan(DISCONNECTED_POLL_MS);
  });

  it("polls quickly when realtime is not connected", () => {
    // Arrange: realtime has never been observed end-to-end on this stack. If it
    // does not connect, the merchant must still get their orders.
    const interval = resolvePollMs("disconnected");

    // Assert
    expect(interval).toBe(DISCONNECTED_POLL_MS);
  });
});

describe("isRefRealtimeBacked", () => {
  it("refreshes the live queue on an order change", () => {
    expect(isRefRealtimeBacked("orders:getRealtimeQueue")).toBe(true);
  });

  it("refreshes the order list and dashboard stats on an order change", () => {
    expect(isRefRealtimeBacked("orders:getOrders")).toBe(true);
    expect(isRefRealtimeBacked("orders:getDashboardStats")).toBe(true);
  });

  it("does not tie a non-order ref to the orders channel", () => {
    // Arrange: analytics is not served by this subscription. Refetching it on
    // every order change would be wasted work and misleading if it ever gains a
    // platform implementation with its own freshness rules.
    expect(isRefRealtimeBacked("analytics:getUpsellAnalytics")).toBe(false);
  });
});

describe("isRefRealtimeBacked — order line items", () => {
  /**
   * Line items are written in the same breath as their order, so an order
   * change is the freshness signal for `getAllOrderItems` too. Left off this
   * list, the kitchen board polls a 10k-row join every 15 seconds forever and
   * a new ticket renders with no items for up to a full poll interval.
   */
  it("refreshes the tenant's line items on an order change", () => {
    expect(isRefRealtimeBacked("orders:getAllOrderItems")).toBe(true);
  });
});

describe("resolvePollMs — backing off while reads fail", () => {
  // A failing read must not be re-issued every 15 s by every device: that is
  // the loop that turned a slow database into a saturated one on 2026-09-20.
  const exact = () => 0.5;

  it("keeps the base interval while nothing has failed", () => {
    expect(resolvePollMs("disconnected", 0, exact)).toBe(DISCONNECTED_POLL_MS);
    expect(resolvePollMs("connected", 0, exact)).toBe(REALTIME_FALLBACK_POLL_MS);
  });

  it("doubles the interval per consecutive failure", () => {
    expect(resolvePollMs("disconnected", 1, exact)).toBe(DISCONNECTED_POLL_MS * 2);
    expect(resolvePollMs("disconnected", 2, exact)).toBe(DISCONNECTED_POLL_MS * 4);
  });

  it("never waits longer than the failure ceiling", () => {
    expect(resolvePollMs("disconnected", 10, exact)).toBe(MAX_FAILURE_POLL_MS);
    expect(resolvePollMs("connected", 10, exact)).toBe(MAX_FAILURE_POLL_MS);
    expect(MAX_FAILURE_POLL_MS).toBe(120_000);
  });

  it("spreads retries with up to twenty percent jitter so devices do not stampede", () => {
    expect(resolvePollMs("disconnected", 1, () => 0)).toBe(DISCONNECTED_POLL_MS * 2 * 0.8);
    expect(resolvePollMs("disconnected", 1, () => 1)).toBe(DISCONNECTED_POLL_MS * 2 * 1.2);
  });

  it("applies no jitter to a healthy poll", () => {
    expect(resolvePollMs("disconnected", 0, () => 1)).toBe(DISCONNECTED_POLL_MS);
  });
});

describe("countConsecutiveFailures", () => {
  it("counts errors since the last success, not since the query was born", () => {
    // Two errors, then a success at t=100, then one more error.
    const afterSuccess = countConsecutiveFailures({ dataUpdatedAt: 100, errorUpdateCount: 2 }, NO_FAILURES);
    expect(afterSuccess.failures).toBe(0);

    const afterOneMore = countConsecutiveFailures({ dataUpdatedAt: 100, errorUpdateCount: 3 }, afterSuccess.streak);
    expect(afterOneMore.failures).toBe(1);
  });

  it("counts every error before the first success", () => {
    expect(countConsecutiveFailures({ dataUpdatedAt: 0, errorUpdateCount: 3 }, NO_FAILURES).failures).toBe(3);
  });

  it("starts over on a query with fresh counters instead of going negative", () => {
    const stale = { dataUpdatedAt: 500, errorsAtLastSuccess: 4 };
    expect(countConsecutiveFailures({ dataUpdatedAt: 0, errorUpdateCount: 0 }, stale)).toEqual({
      streak: { dataUpdatedAt: 0, errorsAtLastSuccess: 0 },
      failures: 0,
    });
  });
});
