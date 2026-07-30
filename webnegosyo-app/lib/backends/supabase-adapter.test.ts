import {
  isPlatformRefSupported,
  runPlatformQuery,
  runPlatformMutation,
  type PlatformClient,
} from "./supabase-adapter";
import type { BranchScope } from "../branch-scope";

/**
 * The adapter answers the same string function refs the screens already send to
 * Convex ("orders:getOrders"), but against the shared platform Supabase.
 *
 * A recording fake stands in for supabase-js so the query SHAPE is assertable —
 * in particular that every read and write is scoped to the caller's tenant.
 * That filter is not cosmetic: a superadmin's RLS policy grants them every
 * tenant's rows, so an unscoped query would render another merchant's orders
 * (and customer phone numbers) inside the impersonated store.
 */

interface RecordedOp {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface RecordedCall {
  readonly table: string;
  readonly ops: RecordedOp[];
}

interface TableResponse {
  data: unknown;
  error: { message: string } | null;
}

function fakeClient(responses: Record<string, TableResponse[]>) {
  const calls: RecordedCall[] = [];

  function makeChain(table: string) {
    const call: RecordedCall = { table, ops: [] };
    calls.push(call);

    const chain: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      call.ops.push({ method, args });
      return chain;
    };

    for (const method of [
      "select",
      "eq",
      "in",
      "gte",
      "lte",
      "order",
      "limit",
      "insert",
      "update",
      "maybeSingle",
      "single",
    ]) {
      chain[method] = record(method);
    }

    chain.then = (
      resolve: (value: TableResponse) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      const queue = responses[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(next).then(resolve, reject);
    };

    return chain;
  }

  const client = {
    from: (table: string) => makeChain(table),
  } as unknown as PlatformClient;

  return { client, calls };
}

/** Every op of a given kind across all recorded calls, flattened for assertions. */
function opsOf(calls: RecordedCall[], method: string): unknown[][] {
  return calls.flatMap((call) =>
    call.ops.filter((op) => op.method === method).map((op) => [...op.args])
  );
}

function orderRowFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    tenant_id: "tenant-1",
    customer_name: "Ana",
    customer_contact: "0917",
    customer_data: null,
    total: 250,
    item_count: 2,
    status: "pending",
    source: "web",
    order_type: null,
    order_type_id: null,
    payment_status: "pending",
    payment_method_name: null,
    payment_method_details: null,
    delivery_fee: null,
    scheduled_for: null,
    client_order_id: null,
    created_at: "2026-07-27T02:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

const TENANT = "tenant-1";

describe("isPlatformRefSupported", () => {
  it("claims the order refs the screens send", () => {
    expect(isPlatformRefSupported("orders:getOrders")).toBe(true);
    expect(isPlatformRefSupported("orders:getDashboardStats")).toBe(true);
    expect(isPlatformRefSupported("orders:updateOrderStatus")).toBe(true);
  });

  it("claims the order-edit refs", () => {
    // Without these in the allowlist the edit screen silently no-ops on the
    // platform backend — the mutation is dispatched and nothing is written.
    expect(isPlatformRefSupported("orders:reviseOrder")).toBe(true);
    expect(isPlatformRefSupported("orders:recordPayment")).toBe(true);
  });

  /**
   * The write refs alone are not enough. An edit session opens with the
   * settlement ledger, and a ref the adapter cannot serve reports unsupported —
   * so on the platform backend the session would open with no payments, read a
   * fully-paid order as unpaid, and ask the cashier to collect the whole bill a
   * second time.
   */
  it("claims the ledger read refs the edit session opens with", () => {
    expect(isPlatformRefSupported("orders:getOrderPayments")).toBe(true);
    expect(isPlatformRefSupported("orders:getOrderRevisions")).toBe(true);
  });

  it("does not claim refs it cannot serve yet", () => {
    // Analytics still lives only on Convex. Claiming it would make the screen
    // render an empty chart instead of its "needs a backend update" placeholder.
    expect(isPlatformRefSupported("analytics:getUpsellAnalytics")).toBe(false);
  });
});

describe("runPlatformQuery — the settlement ledger", () => {
  it("returns an order's payments oldest first, in the shape Convex returns", async () => {
    // Arrange: the edit session consumes these through `computeBalance`, which
    // reads camelCase `kind` and `amount`. A snake_case row would net to zero
    // and read as an unpaid order.
    const { client, calls } = fakeClient({
      order_payments: [
        {
          data: [
            {
              id: "pay-1",
              order_id: "order-1",
              kind: "charge",
              amount: "150.00",
              payment_method_name: "GCash",
              reference: "REF-9",
              created_at: "2026-07-29T02:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });

    // Act
    const rows = (await runPlatformQuery(client, TENANT, "orders:getOrderPayments", {
      orderId: "order-1",
    })) as Array<Record<string, unknown>>;

    // Assert
    expect(rows[0].kind).toBe("charge");
    expect(rows[0].amount).toBe(150);
    expect(rows[0].paymentMethodName).toBe("GCash");
    expect(rows[0].reference).toBe("REF-9");
    expect(opsOf(calls, "order")[0]).toEqual(["created_at", { ascending: true }]);
  });

  it("scopes the ledger to the caller's tenant and the asked-for order", async () => {
    // Arrange: `order_payments` carries its own tenant_id, and a superadmin's
    // RLS grant spans every tenant — an unscoped read would show another
    // merchant's takings.
    const { client, calls } = fakeClient({
      order_payments: [{ data: [], error: null }],
    });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrderPayments", { orderId: "order-1" });

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
    expect(opsOf(calls, "eq")).toContainEqual(["order_id", "order-1"]);
  });

  it("surfaces a ledger error instead of reporting an order as unpaid", async () => {
    // Arrange: this is the dangerous silent failure — an empty ledger and a
    // failed read are indistinguishable, and one of them tells the cashier to
    // collect a bill that was already paid.
    const { client } = fakeClient({
      order_payments: [{ data: null, error: { message: "permission denied" } }],
    });

    // Act + Assert
    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrderPayments", { orderId: "order-1" })
    ).rejects.toThrow("permission denied");
  });

  it("returns revision history newest first, in the shape Convex returns", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      order_revisions: [
        {
          data: [
            {
              id: "rev-1",
              order_id: "order-1",
              revision_number: 2,
              items_before: [],
              items_after: [],
              total_before: "250.00",
              total_after: "370.00",
              reason: "Customer added a drink",
              revised_by: "staff-1",
              created_at: "2026-07-29T02:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });

    // Act
    const rows = (await runPlatformQuery(client, TENANT, "orders:getOrderRevisions", {
      orderId: "order-1",
    })) as Array<Record<string, unknown>>;

    // Assert
    expect(rows[0].revisionNumber).toBe(2);
    expect(rows[0].totalBefore).toBe(250);
    expect(rows[0].totalAfter).toBe(370);
    expect(rows[0].reason).toBe("Customer added a drink");
    expect(rows[0].revisedBy).toBe("staff-1");
    expect(opsOf(calls, "order")[0]).toEqual(["revision_number", { ascending: false }]);
  });
});

describe("runPlatformQuery — orders:getOrders", () => {
  it("returns orders scoped to the caller's tenant, newest first", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      orders: [{ data: [orderRowFixture()], error: null }],
    });

    // Act
    const result = (await runPlatformQuery(client, TENANT, "orders:getOrders", {})) as Array<{
      _id: string;
    }>;

    // Assert
    expect(result[0]._id).toBe("order-1");
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
    expect(opsOf(calls, "order")[0]).toEqual(["created_at", { ascending: false }]);
  });

  it("filters by status when the screen asks for one", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", { status: "preparing" });

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["status", "preparing"]);
  });

  it("surfaces a database error instead of pretending there are no orders", async () => {
    // Arrange: an empty queue and a failed query look identical to the screen
    // unless the error propagates.
    const { client } = fakeClient({
      orders: [{ data: null, error: { message: "permission denied" } }],
    });

    // Act + Assert
    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrders", {})
    ).rejects.toThrow("permission denied");
  });
});

describe("runPlatformQuery — orders:getOrderById", () => {
  it("returns the order with its line items nested", async () => {
    // Arrange
    const { client } = fakeClient({
      orders: [
        {
          data: {
            ...orderRowFixture(),
            order_items: [
              {
                id: "item-1",
                order_id: "order-1",
                menu_item_id: "menu-1",
                menu_item_name: "Latte",
                quantity: 2,
                price: 120,
                subtotal: 240,
                variation: null,
                variation_selections: null,
                addons: null,
                special_instructions: null,
                is_upsell_item: false,
                is_bundle_item: false,
                bundle_id: null,
                bundle_name: null,
                slot_name: null,
              },
            ],
          },
          error: null,
        },
      ],
    });

    // Act
    const order = (await runPlatformQuery(client, TENANT, "orders:getOrderById", {
      orderId: "order-1",
    })) as { items: Array<{ menuItemName: string }> } | null;

    // Assert
    expect(order?.items[0].menuItemName).toBe("Latte");
  });

  it("returns null for an order that is not this tenant's", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    const order = await runPlatformQuery(client, TENANT, "orders:getOrderById", {
      orderId: "someone-elses",
    });

    // Assert
    expect(order).toBeNull();
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });
});

describe("runPlatformQuery — orders:getRealtimeQueue", () => {
  it("returns the four open buckets the dashboard renders", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      orders: [
        {
          data: [
            orderRowFixture({ id: "a", status: "pending" }),
            orderRowFixture({ id: "b", status: "ready" }),
          ],
          error: null,
        },
      ],
    });

    // Act
    const queue = (await runPlatformQuery(
      client,
      TENANT,
      "orders:getRealtimeQueue",
      {}
    )) as Record<string, Array<{ _id: string }>>;

    // Assert
    expect(queue.pending.map((o) => o._id)).toEqual(["a"]);
    expect(queue.ready.map((o) => o._id)).toEqual(["b"]);
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });
});

describe("runPlatformQuery — dashboard stats", () => {
  it("counts only today's orders, bounded at the merchant's local midnight", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      orders: [{ data: [orderRowFixture({ status: "delivered", total: 100 })], error: null }],
    });

    // Act
    const stats = (await runPlatformQuery(
      client,
      TENANT,
      "orders:getDashboardStats",
      {}
    )) as { totalRevenue: number };

    // Assert
    expect(stats.totalRevenue).toBe(100);
    const gte = opsOf(calls, "gte")[0];
    expect(gte[0]).toBe("created_at");
    // Manila midnight is 16:00 UTC the previous day.
    expect(String(gte[1])).toMatch(/T16:00:00/);
  });

  it("bounds an explicit period by both ends", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });
    const startDate = Date.parse("2026-07-01T00:00:00.000Z");
    const endDate = Date.parse("2026-07-31T23:59:59.000Z");

    // Act
    await runPlatformQuery(client, TENANT, "orders:getDashboardStatsByPeriod", {
      startDate,
      endDate,
    });

    // Assert
    expect(opsOf(calls, "gte")[0]).toEqual(["created_at", new Date(startDate).toISOString()]);
    expect(opsOf(calls, "lte")[0]).toEqual(["created_at", new Date(endDate).toISOString()]);
  });
});

describe("runPlatformMutation — orders:createOrder", () => {
  const args = {
    customerName: "Ana",
    customerContact: "0917",
    total: 240,
    itemCount: 2,
    source: "pos" as const,
    items: [
      { menuItemId: "menu-1", menuItemName: "Latte", quantity: 2, price: 120, subtotal: 240 },
    ],
  };

  it("inserts the order and its items, returning the new order id", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      orders: [{ data: { id: "new-order" }, error: null }],
      order_items: [{ data: null, error: null }],
    });

    // Act
    const orderId = await runPlatformMutation(client, TENANT, "orders:createOrder", args);

    // Assert
    expect(orderId).toBe("new-order");
    expect(calls.map((c) => c.table)).toEqual(["orders", "order_items"]);
    const [itemsInsert] = opsOf(calls, "insert").slice(-1);
    expect(itemsInsert[0]).toEqual([expect.objectContaining({ order_id: "new-order" })]);
  });

  it("returns the existing order when the same submit is retried", async () => {
    // Arrange: a flaky network retry must not double-charge the customer.
    const { client, calls } = fakeClient({
      orders: [{ data: { id: "already-there" }, error: null }],
    });

    // Act
    const orderId = await runPlatformMutation(client, TENANT, "orders:createOrder", {
      ...args,
      clientOrderId: "abc-123",
    });

    // Assert
    expect(orderId).toBe("already-there");
    expect(calls.map((c) => c.table)).toEqual(["orders"]);
    expect(opsOf(calls, "insert")).toEqual([]);
  });

  it("does not leave orphan items when the item insert fails", async () => {
    // Arrange
    const { client } = fakeClient({
      orders: [{ data: { id: "new-order" }, error: null }],
      order_items: [{ data: null, error: { message: "constraint violation" } }],
    });

    // Act + Assert: the caller must hear about it rather than see a silent
    // order with no line items.
    await expect(
      runPlatformMutation(client, TENANT, "orders:createOrder", args)
    ).rejects.toThrow("constraint violation");
  });
});

describe("runPlatformMutation — status updates", () => {
  it("advances an order's status within the caller's tenant", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updateOrderStatus", {
      orderId: "order-1",
      status: "preparing",
    });

    // Assert
    expect(opsOf(calls, "update")[0]).toEqual([{ status: "preparing" }]);
    expect(opsOf(calls, "eq")).toContainEqual(["id", "order-1"]);
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });

  it("records a payment status change", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updatePaymentStatus", {
      orderId: "order-1",
      paymentStatus: "paid",
    });

    // Assert
    expect(opsOf(calls, "update")[0]).toEqual([{ payment_status: "paid" }]);
  });

  it("rejects an unknown mutation ref rather than silently doing nothing", async () => {
    // Arrange
    const { client } = fakeClient({});

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:teleport", {})
    ).rejects.toThrow(/not supported/i);
  });
});

describe("runPlatformQuery — orders:getAllOrderItems", () => {
  function itemRowFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "item-1",
      order_id: "order-1",
      menu_item_id: "menu-1",
      menu_item_name: "Latte",
      quantity: 2,
      price: 120,
      subtotal: 240,
      variation: null,
      variation_selections: null,
      addons: null,
      special_instructions: null,
      is_upsell_item: null,
      is_bundle_item: null,
      bundle_id: null,
      bundle_name: null,
      slot_name: null,
      ...overrides,
    };
  }

  it("is claimed as a supported ref so product analytics does not fall through to Convex", () => {
    expect(isPlatformRefSupported("orders:getAllOrderItems")).toBe(true);
  });

  it("scopes items to the caller's tenant through the parent order", async () => {
    // Arrange: order_items carries no tenant_id of its own, so an unscoped read
    // would hand a superadmin every merchant's line items.
    const { client, calls } = fakeClient({
      order_items: [{ data: [itemRowFixture()], error: null }],
    });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {});

    // Assert
    expect(calls[0].table).toBe("order_items");
    expect(opsOf(calls, "select")[0][0]).toContain("orders!inner");
    expect(opsOf(calls, "eq")).toContainEqual(["orders.tenant_id", TENANT]);
  });

  it("returns item DTOs carrying the parent order id", async () => {
    // Arrange
    const { client } = fakeClient({
      order_items: [{ data: [itemRowFixture({ order_id: "order-9" })], error: null }],
    });

    // Act
    const items = (await runPlatformQuery(
      client,
      TENANT,
      "orders:getAllOrderItems",
      {}
    )) as Array<{ orderId: string; menuItemName: string; quantity: number }>;

    // Assert
    expect(items).toEqual([
      expect.objectContaining({ orderId: "order-9", menuItemName: "Latte", quantity: 2 }),
    ]);
  });

  it("bounds the read rather than scanning every line item ever written", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      order_items: [{ data: [], error: null }],
    });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {});

    // Assert
    expect(opsOf(calls, "limit")).toHaveLength(1);
    expect(opsOf(calls, "limit")[0][0]).toBeLessThanOrEqual(10000);
  });

  it("returns an empty list when the tenant has no items yet", async () => {
    // Arrange
    const { client } = fakeClient({ order_items: [{ data: null, error: null }] });

    // Act
    const items = await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {});

    // Assert
    expect(items).toEqual([]);
  });
});

/**
 * A branch manager's device must not RECEIVE another branch's orders, not
 * merely decline to draw them. Client-side filtering already hid them, but the
 * rows — customer names and phone numbers included — still crossed the wire.
 *
 * The scope passed here is the ACCOUNT's, never the branch an owner has drilled
 * into. Narrowing the query by a viewing selection would leave the portfolio
 * unable to fetch the branches it is meant to compare, and an owner is entitled
 * to the whole store anyway, so there is nothing to gain by pushing their
 * drill-down to the server.
 */
describe("branch-scoped reads", () => {
  const BRANCH: BranchScope = { kind: "branch", outletId: "outlet-north" };
  const ALL: BranchScope = { kind: "all" };

  it("narrows getOrders to the account's branch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", {}, BRANCH);

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows the live queue to the account's branch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getRealtimeQueue", {}, BRANCH);

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows the day's stats to the account's branch", async () => {
    // Arrange: otherwise a manager's dashboard reports the whole company's
    // takings as their own.
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getDashboardStats", {}, BRANCH);

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows a single order fetch, so a deep link cannot open another branch's order", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformQuery(
      client,
      TENANT,
      "orders:getOrderById",
      { orderId: "order-9" },
      BRANCH
    );

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows line items through their parent order", async () => {
    // Arrange: `order_items` has no branch of its own, so it is scoped the same
    // way its tenant is — through the join.
    const { client, calls } = fakeClient({ order_items: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {}, BRANCH);

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["orders.outlet_id", "outlet-north"]);
  });

  it("adds no branch filter for a store-wide account", async () => {
    // Arrange: the overwhelmingly common case must produce the query it
    // produces today, character for character.
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", {}, ALL);

    // Assert
    expect(opsOf(calls, "eq").map(([column]) => column)).not.toContain("outlet_id");
  });

  it("defaults to store-wide when no scope is passed", async () => {
    // Arrange: an omitted scope must not silently narrow to nothing.
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", {});

    // Assert
    expect(opsOf(calls, "eq").map(([column]) => column)).not.toContain("outlet_id");
  });

  it("still filters the tenant when a branch is in scope", async () => {
    // Arrange: the branch predicate is layered ON TOP of the tenant one, never
    // instead of it — outlet ids are unique, but relying on that would make a
    // cross-tenant leak one schema change away.
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", {}, BRANCH);

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });
});

/**
 * A write is addressed by id, so it never passes through the read filter that
 * now hides other branches. A stale notification, a deep link, or a screen left
 * open across a branch switch could otherwise still mutate an order the account
 * may not see. The branch goes into the WHERE clause of the write itself, which
 * makes the check atomic with the update rather than a read-then-write race.
 */
describe("branch-scoped writes", () => {
  const BRANCH: BranchScope = { kind: "branch", outletId: "outlet-north" };

  it("narrows a status patch to the account's branch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformMutation(
      client,
      TENANT,
      "orders:updateOrderStatus",
      { orderId: "order-9", status: "ready" },
      BRANCH
    );

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows a payment-status patch to the account's branch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformMutation(
      client,
      TENANT,
      "orders:updatePaymentStatus",
      { orderId: "order-9", paymentStatus: "paid" },
      BRANCH
    );

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("refuses to revise an order outside the account's branch", async () => {
    // Arrange: the revise path reads the order first, so an out-of-branch order
    // comes back as absent under the same filter the reads use.
    const { client } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act + Assert
    await expect(
      runPlatformMutation(
        client,
        TENANT,
        "orders:reviseOrder",
        { orderId: "order-9", items: [], total: 0 },
        BRANCH
      )
    ).rejects.toThrow();
  });

  it("adds no branch filter to a store-wide account's patch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updateOrderStatus", {
      orderId: "order-9",
      status: "ready",
    });

    // Assert
    expect(opsOf(calls, "eq").map(([column]) => column)).not.toContain("outlet_id");
  });
});

describe("tenant guard", () => {
  it("refuses to run without a tenant rather than querying every tenant's orders", async () => {
    // Arrange: a superadmin who has not entered a store has no tenant, and
    // their RLS policy grants them every row.
    const { client } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act + Assert
    await expect(runPlatformQuery(client, "", "orders:getOrders", {})).rejects.toThrow(
      /tenant/i
    );
  });
});
