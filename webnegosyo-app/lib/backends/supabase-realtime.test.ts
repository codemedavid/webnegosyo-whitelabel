import {
  DISCONNECTED_POLL_MS,
  REALTIME_FALLBACK_POLL_MS,
  buildOrderSubscription,
  isOrderChangeForTenant,
  isRefRealtimeBacked,
  resolvePollMs,
  resolveRealtimeStatus,
} from "./supabase-realtime";

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
