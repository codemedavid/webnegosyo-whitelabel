import {
  ORDER_ID_CHUNK_SIZE,
  ORDER_LEDGER_LIMIT,
  ORDER_REVISIONS_LIMIT,
  isPlatformRefSupported,
  runPlatformAction,
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
      "lte",      "gte",
      "lt",
      "order",
      "limit",
      "insert",
      "update",
      "delete",
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

/**
 * Real uuids, because the adapter now refuses a non-uuid at every uuid-typed
 * filter. `id=eq.undefined` and `id=eq.js71q9w...` are both 22P02 at Postgres —
 * a raw database error where a cashier expected a saved tap — so ids that only
 * look like ids no longer stand in for the real thing here.
 */
const ORDER_ID = "1f2e3d4c-5b6a-4798-8a0b-1c2d3e4f5061";
const OTHER_ORDER_ID = "2a3b4c5d-6e7f-4081-9203-4a5b6c7d8e9f";
const MISSING_ORDER_ID = "5d6e7f80-9112-43a4-b5c6-7d8e9f012345";
const CONVEX_ORDER_ID = "js71q9w4ja9g3ryvap69b9xxms8e3fzs";

describe("isPlatformRefSupported", () => {
  it("claims the order refs the screens send", () => {
    expect(isPlatformRefSupported("orders:getOrders")).toBe(true);
    expect(isPlatformRefSupported("orders:getDashboardStats")).toBe(true);
    expect(isPlatformRefSupported("orders:updateOrderStatus")).toBe(true);
  });

  it("claims the analytics, product cost and product analytics refs", () => {
    // Off this list a platform store's Analytics, Trends, Growth and product
    // screens all showed "public function not found".
    expect(isPlatformRefSupported("analytics:getSalesAnalytics")).toBe(true);
    expect(isPlatformRefSupported("productAnalytics:getPortfolioSummary")).toBe(true);
    expect(isPlatformRefSupported("productCosts:setCost")).toBe(true);
    expect(isPlatformRefSupported("productAnalyticsAggregator:refreshAnalytics")).toBe(true);
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
    expect(isPlatformRefSupported("lalamove:bookLalamove")).toBe(false);
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
      orderId: ORDER_ID,
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
    await runPlatformQuery(client, TENANT, "orders:getOrderPayments", { orderId: ORDER_ID });

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
    expect(opsOf(calls, "eq")).toContainEqual(["order_id", ORDER_ID]);
  });

  it("bounds the ledger and the revision history so a phone never pulls an unbounded table", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      order_payments: [{ data: [], error: null }],
      order_revisions: [{ data: [], error: null }],
    });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrderPayments", { orderId: ORDER_ID });
    await runPlatformQuery(client, TENANT, "orders:getOrderRevisions", { orderId: ORDER_ID });

    // Assert
    expect(opsOf(calls, "limit")).toEqual([[ORDER_LEDGER_LIMIT], [ORDER_REVISIONS_LIMIT]]);
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
      runPlatformQuery(client, TENANT, "orders:getOrderPayments", { orderId: ORDER_ID })
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
      orderId: ORDER_ID,
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
      orderId: ORDER_ID,
    })) as { items: Array<{ menuItemName: string }> } | null;

    // Assert
    expect(order?.items[0].menuItemName).toBe("Latte");
  });

  it("returns null for an order that is not this tenant's", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: null, error: null }] });

    // Act
    const order = await runPlatformQuery(client, TENANT, "orders:getOrderById", {
      orderId: OTHER_ORDER_ID,
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

describe("runPlatformMutation — prep time", () => {
  it("is claimed by the allowlist AND served by the switch", async () => {
    // Both halves matter. A ref in SUPPORTED_MUTATION_REFS with no case in the
    // switch routes to the platform and then throws; a case with no allowlist
    // entry never routes here at all.
    expect(isPlatformRefSupported("orders:setPrepTime")).toBe(true);

    const { client, calls } = fakeClient({ orders: [{ data: [{ id: "order-1" }], error: null }] });

    await runPlatformMutation(client, TENANT, "orders:setPrepTime", {
      orderId: ORDER_ID,
      prepMinutes: 15,
      promisedReadyAt: "2026-07-27T02:15:00.000Z",
      status: "preparing",
    });

    expect(opsOf(calls, "update")[0]).toEqual([
      {
        prep_minutes: 15,
        promised_ready_at: "2026-07-27T02:15:00.000Z",
        status: "preparing",
      },
    ]);
    expect(opsOf(calls, "eq")).toContainEqual(["id", ORDER_ID]);
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });

  it("refuses a prep time for an order outside the caller's branch", async () => {
    // Same guard every other write here carries: a branch-scoped account must
    // not be able to re-time another branch's ticket.
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformMutation(
        client,
        TENANT,
        "orders:setPrepTime",
        {
          orderId: ORDER_ID,
          prepMinutes: 15,
          promisedReadyAt: "2026-07-27T02:15:00.000Z",
          status: "preparing",
        },
        { kind: "branch", outletId: "outlet-9" }
      )
    ).rejects.toThrow();

    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-9"]);
  });
});

describe("runPlatformMutation — status updates", () => {
  it("advances an order's status within the caller's tenant", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [{ id: "order-1" }], error: null }] });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updateOrderStatus", {
      orderId: ORDER_ID,
      status: "preparing",
    });

    // Assert
    expect(opsOf(calls, "update")[0]).toEqual([{ status: "preparing" }]);
    expect(opsOf(calls, "eq")).toContainEqual(["id", ORDER_ID]);
    expect(opsOf(calls, "eq")).toContainEqual(["tenant_id", TENANT]);
  });

  it("records a payment status change", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [{ id: "order-1" }], error: null }] });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updatePaymentStatus", {
      orderId: ORDER_ID,
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

  /**
   * PostgREST can only ORDER BY an embedded column the embed actually selects.
   * With `orders!inner(tenant_id)` alone, `order=orders(created_at).desc` was
   * refused with `column order_items_orders_1.created_at does not exist` — 198
   * times in one day, emptying every platform store's kitchen board and
   * product analytics. The sort column must ride in the projection.
   */
  it("selects orders.created_at in the embed so the newest-first sort is valid", async () => {
    const { client, calls } = fakeClient({ order_items: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {});

    const select = String(opsOf(calls, "select")[0][0]);
    const embed = select.match(/orders!inner\(([^)]*)\)/)?.[1] ?? "";
    expect(embed.split(",").map((s) => s.trim())).toEqual(
      expect.arrayContaining(["tenant_id", "created_at"])
    );
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
      { orderId: ORDER_ID },
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
    const { client, calls } = fakeClient({ orders: [{ data: [{ id: "order-9" }], error: null }] });

    // Act
    await runPlatformMutation(
      client,
      TENANT,
      "orders:updateOrderStatus",
      { orderId: ORDER_ID, status: "ready" },
      BRANCH
    );

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("narrows a payment-status patch to the account's branch", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [{ id: "order-9" }], error: null }] });

    // Act
    await runPlatformMutation(
      client,
      TENANT,
      "orders:updatePaymentStatus",
      { orderId: ORDER_ID, paymentStatus: "paid" },
      BRANCH
    );

    // Assert
    expect(opsOf(calls, "eq")).toContainEqual(["outlet_id", "outlet-north"]);
  });

  it("refuses to revise an order outside the account's branch", async () => {
    // Arrange: the revise path reads the order first, so an out-of-branch order
    // comes back as absent under the same filter the reads use.
    const { client } = fakeClient({ orders: [{ data: [{ id: "order-9" }], error: null }] });

    // Act + Assert
    await expect(
      runPlatformMutation(
        client,
        TENANT,
        "orders:reviseOrder",
        { orderId: ORDER_ID, items: [], total: 0 },
        BRANCH
      )
    ).rejects.toThrow();
  });

  it("adds no branch filter to a store-wide account's patch", async () => {
    // Arrange
    const { client, calls } = fakeClient({
      orders: [{ data: [{ id: "order-9" }], error: null }],
    });

    // Act
    await runPlatformMutation(client, TENANT, "orders:updateOrderStatus", {
      orderId: ORDER_ID,
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

describe("runPlatformQuery — getAllOrderItems ordering", () => {
  /**
   * The read is capped at STATS_LIMIT rows. Without an explicit ordering the
   * database chooses which rows survive the cap — and past 10,000 line items it
   * is the NEWEST orders' items that silently vanish from the kitchen board and
   * product analytics. Newest-parent-first makes the cap drop history instead.
   */
  it("orders items newest-parent-first before applying the cap", async () => {
    const { client, calls } = fakeClient({ order_items: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {});

    expect(opsOf(calls, "order")).toContainEqual([
      "orders(created_at)",
      { ascending: false },
    ]);
    expect(opsOf(calls, "limit").length).toBeGreaterThan(0);
  });
});

describe("runPlatformMutation — silent no-op writes", () => {
  /**
   * An UPDATE that matches no row (RLS refusal, out-of-branch order, deleted
   * order) used to resolve as success — the cashier saw the tap "work" while
   * nothing was written. The write must read back what it touched and refuse
   * loudly when that is nothing.
   */
  it("throws when a status update matched no row instead of claiming success", async () => {
    const { client } = fakeClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformMutation(client, TENANT, "orders:updateOrderStatus", {
        orderId: MISSING_ORDER_ID,
        status: "preparing",
      })
    ).rejects.toThrow(/no longer|not found|matched no/i);
  });

  it("throws when a payment-status update matched no row", async () => {
    const { client } = fakeClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformMutation(client, TENANT, "orders:updatePaymentStatus", {
        orderId: MISSING_ORDER_ID,
        paymentStatus: "paid",
      })
    ).rejects.toThrow(/no longer|not found|matched no/i);
  });
});

describe("runPlatformQuery — period stats input validation", () => {
  /**
   * `Number(undefined)` is NaN, and `new Date(NaN).toISOString()` throws a bare
   * RangeError("Invalid time value") — a crash with no clue which screen sent
   * it. A malformed period must be refused with a message a human can act on.
   */
  it("rejects a period query with a missing or malformed date range", async () => {
    const { client } = fakeClient({});

    await expect(
      runPlatformQuery(client, TENANT, "orders:getDashboardStatsByPeriod", {})
    ).rejects.toThrow(/date range/i);

    await expect(
      runPlatformQuery(client, TENANT, "orders:getDashboardStatsByPeriod", {
        startDate: "yesterday-ish",
        endDate: 2,
      })
    ).rejects.toThrow(/date range/i);
  });
});

describe("runPlatformAction", () => {
  it("treats the product analytics refresh as a no-op — platform figures are computed live", async () => {
    const { client, calls } = fakeClient({});

    await expect(
      runPlatformAction(client, TENANT, "productAnalyticsAggregator:refreshAnalytics", {})
    ).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("rejects an action it does not serve", async () => {
    const { client } = fakeClient({});

    await expect(
      runPlatformAction(client, TENANT, "lalamove:bookLalamove", {})
    ).rejects.toThrow(/not supported/);
  });
});

/**
 * Every `.eq()` against a uuid column is a place a non-uuid becomes a hard 400.
 *
 * supabase-js serialises whatever it is handed into the query string, so
 * `undefined` becomes the literal `id=eq.undefined` and a Convex document id
 * goes through as-is. Postgres answers both with `invalid input syntax for type
 * uuid`, which `unwrap` re-throws verbatim — the cashier reads a database error
 * message. `String(args.orderId)` was worse still: it actively defeated the
 * nullish check that would have made the ledger reads safe.
 */
describe("uuid-typed filters", () => {
  it("reads an absent order id as an EMPTY ledger, not an unreadable one", async () => {
    // Arrange: a MISSING ledger and a FAILED read must stay distinguishable —
    // one of them tells the cashier to collect a bill that was already paid.
    const { client, calls } = fakeClient({});

    // Act
    const rows = await runPlatformQuery(client, TENANT, "orders:getOrderPayments", {});

    // Assert: refused before the round-trip, so nothing reaches the database.
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads a Convex-style order id as an empty revision history", async () => {
    // Arrange
    const { client, calls } = fakeClient({});

    // Act
    const rows = await runPlatformQuery(client, TENANT, "orders:getOrderRevisions", {
      orderId: CONVEX_ORDER_ID,
    });

    // Assert
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("returns null from a single-order fetch rather than a raw 22P02", async () => {
    // Arrange: a stale push notification can carry an id from another backend.
    const { client, calls } = fakeClient({});

    // Act
    const order = await runPlatformQuery(client, TENANT, "orders:getOrderById", {
      orderId: CONVEX_ORDER_ID,
    });

    // Assert
    expect(order).toBeNull();
    expect(calls).toEqual([]);
  });

  it("refuses a status patch with a missing order id, before writing", async () => {
    // Arrange
    const { client, calls } = fakeClient({});

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:updateOrderStatus", { status: "ready" })
    ).rejects.toThrow(/order/i);
    expect(calls).toEqual([]);
  });

  it("refuses a prep-time patch whose order id is not a uuid", async () => {
    // Arrange
    const { client, calls } = fakeClient({});

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:setPrepTime", {
        orderId: CONVEX_ORDER_ID,
        prepMinutes: 15,
        promisedReadyAt: "2026-07-27T02:15:00.000Z",
        status: "preparing",
      })
    ).rejects.toThrow(/order/i);
    expect(calls).toEqual([]);
  });

  it("refuses to revise an order whose id is not a uuid, before touching anything", async () => {
    // Arrange: the revise path is destructive, so an id it cannot filter on
    // must stop it at the door rather than part-way through.
    const { client, calls } = fakeClient({});

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:reviseOrder", {
        orderId: CONVEX_ORDER_ID,
        expectedRevisionNumber: 0,
        items: [],
      })
    ).rejects.toThrow(/order/i);
    expect(calls).toEqual([]);
  });
});

/**
 * Replacing an order's items is four PostgREST requests with no transaction
 * around them, and one of them is a DELETE. The original ordering deleted the
 * old lines first, so any refusal on the insert that followed left a LIVE order
 * with zero line items, a stale total, and a revision row claiming the edit had
 * landed. That is not a failed edit; it is a destroyed one.
 *
 * The irreversible step now goes LAST: the replacements are inserted first, and
 * only then are the rows they replace deleted, by id. The worst partial failure
 * is an order showing both sets of lines — visible, and repairable by editing
 * again — instead of an order showing none.
 */
describe("runPlatformMutation — orders:reviseOrder write ordering", () => {
  const MENU_ITEM_ID = "9f0c1a2b-3d4e-4f50-8a91-b2c3d4e5f607";
  const OLD_ITEM_ID = "6e7f8091-a2b3-44c5-9607-8d9e0f1a2b3c";

  const reviseArgs = {
    orderId: ORDER_ID,
    expectedRevisionNumber: 1,
    items: [
      {
        menuItemId: MENU_ITEM_ID,
        menuItemName: "Latte",
        quantity: 2,
        price: 120,
        subtotal: 240,
      },
    ],
  };

  function existingItem() {
    return {
      id: OLD_ITEM_ID,
      order_id: ORDER_ID,
      menu_item_id: MENU_ITEM_ID,
      menu_item_name: "Latte",
      quantity: 1,
      price: 120,
      subtotal: 120,
      variation: null,
      variation_selections: null,
      addons: null,
      special_instructions: null,
      is_upsell_item: false,
      is_bundle_item: false,
      bundle_id: null,
      bundle_name: null,
      slot_name: null,
    };
  }

  /**
   * The revise path talks to three tables in a fixed order; each queue is
   * consumed in call order, so an override replaces one specific round-trip.
   */
  function reviseClient(overrides: {
    itemsInsert?: TableResponse;
    itemsDelete?: TableResponse;
    orderPatch?: TableResponse;
  } = {}) {
    return fakeClient({
      orders: [
        { data: { total: 120, revision_number: 1, status: "confirmed" }, error: null },
        overrides.orderPatch ?? { data: [{ id: ORDER_ID }], error: null },
      ],
      order_items: [
        { data: [existingItem()], error: null },
        overrides.itemsInsert ?? { data: null, error: null },
        overrides.itemsDelete ?? { data: [{ id: OLD_ITEM_ID }], error: null },
      ],
      order_revisions: [{ data: null, error: null }],
    });
  }

  /** Each round-trip as `table:write`, in the order the adapter made them. */
  function writeSequence(calls: RecordedCall[]): string[] {
    return calls.map((call) => {
      const write = call.ops.find((op) =>
        ["insert", "update", "delete"].includes(op.method)
      );
      return `${call.table}:${write ? write.method : "select"}`;
    });
  }

  it("inserts the replacement lines before deleting the ones they replace", async () => {
    // Arrange
    const { client, calls } = reviseClient();

    // Act
    await runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs);

    // Assert
    expect(writeSequence(calls)).toEqual([
      "orders:select",
      "order_items:select",
      "order_revisions:insert",
      "order_items:insert",
      "order_items:delete",
      "orders:update",
    ]);
  });

  it("deletes the previous lines by their own ids, never by order_id", async () => {
    // Arrange: deleting by order_id at this point would take the replacements
    // with it — they are already in the table under the same order.
    const { client, calls } = reviseClient();

    // Act
    await runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs);

    // Assert
    const deleteCall = calls.find((call) => call.ops.some((op) => op.method === "delete"));
    expect(opsOf(deleteCall ? [deleteCall] : [], "in")).toEqual([["id", [OLD_ITEM_ID]]]);
    expect(opsOf(deleteCall ? [deleteCall] : [], "eq")).toEqual([]);
  });

  it("leaves the order's lines intact when the replacement insert is refused", async () => {
    // Arrange: the 22P02/23503 case. Nothing may be deleted.
    const { client, calls } = reviseClient({
      itemsInsert: { data: null, error: { message: "insert or update violates foreign key" } },
    });

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs)
    ).rejects.toThrow(/foreign key/);
    expect(writeSequence(calls)).not.toContain("order_items:delete");
  });

  it("refuses loudly when the delete of the previous lines matched no row", async () => {
    // Arrange: a DELETE refused by RLS affects ZERO rows with NO error, so the
    // only evidence is what comes back. Silence here would leave the order
    // showing every line twice while the cashier is told the edit saved.
    const { client } = reviseClient({ itemsDelete: { data: [], error: null } });

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs)
    ).rejects.toThrow(/twice|duplicat/i);
  });

  it("refuses loudly when the order patch matched no row", async () => {
    // Arrange: the same silent class on the UPDATE. Resolving here would report
    // a saved edit over an order still carrying its old total.
    const { client } = reviseClient({ orderPatch: { data: [], error: null } });

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs)
    ).rejects.toThrow(/total|no longer/i);
  });

  it("returns the order id when every step lands", async () => {
    // Arrange
    const { client } = reviseClient();

    // Act
    const result = await runPlatformMutation(client, TENANT, "orders:reviseOrder", reviseArgs);

    // Assert
    expect(result).toBe(ORDER_ID);
  });
});

/**
 * `createOrder` cannot be reordered: `order_items.order_id` references the
 * order, so the irreversible step is forced to go first. What it CAN do is stop
 * describing the failure as a generic constraint error — a committed, printable
 * sale with no line items needs to be named as such.
 */
describe("runPlatformMutation — orders:createOrder partial failure", () => {
  const args = {
    customerName: "Ana",
    customerContact: "0917",
    total: 240,
    itemCount: 2,
    source: "pos" as const,
    items: [
      {
        menuItemId: "9f0c1a2b-3d4e-4f50-8a91-b2c3d4e5f607",
        menuItemName: "Latte",
        quantity: 2,
        price: 120,
        subtotal: 240,
      },
    ],
  };

  it("names the committed order when its line items could not be written", async () => {
    // Arrange
    const { client } = fakeClient({
      orders: [{ data: { id: ORDER_ID }, error: null }],
      order_items: [{ data: null, error: { message: "constraint violation" } }],
    });

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:createOrder", args)
    ).rejects.toThrow(/line items/i);
  });

  it("carries the underlying refusal and the order id into the message", async () => {
    // Arrange: the cashier's till now holds a sale the kitchen cannot see. The
    // id is the only handle anyone has for repairing it.
    const { client } = fakeClient({
      orders: [{ data: { id: ORDER_ID }, error: null }],
      order_items: [{ data: null, error: { message: "constraint violation" } }],
    });

    // Act + Assert
    await expect(
      runPlatformMutation(client, TENANT, "orders:createOrder", args)
    ).rejects.toThrow(ORDER_ID);
  });
});

/**
 * A date-ranged Orders screen.
 *
 * The queue read is a "most recent N" page, so narrowing it AFTER the fetch
 * would answer "which of the last 50 orders fell on Sep 3?" — on a busy store
 * that is nearly always none, and an empty list is indistinguishable from a
 * day that took no orders. The window has to reach PostgREST.
 */
describe("runPlatformQuery — orders:getOrders over a date window", () => {
  const START = Date.parse("2026-09-02T16:00:00.000Z"); // Manila midnight, Sep 3
  const END = START + 24 * 60 * 60 * 1000;

  /** Every window bound pushed to the orders query, as ISO strings. */
  function windowBounds(calls: RecordedCall[]): unknown[] {
    return [...opsOf(calls, "gte"), ...opsOf(calls, "lt"), ...opsOf(calls, "lte")].map(
      (args) => args[1]
    );
  }

  it("pushes both bounds to the query, not to a post-filter", async () => {
    // Arrange
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, TENANT, "orders:getOrders", { startMs: START, endMs: END });

    // Assert
    const bounds = windowBounds(calls);
    expect(bounds).toContain(new Date(START).toISOString());
    expect(bounds).toContain(new Date(END).toISOString());
  });

  it("still reads the recent queue when no window is sent", async () => {
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getOrders", {});

    expect(windowBounds(calls)).toHaveLength(0);
  });

  it("keeps the status filter alongside the window", async () => {
    const { client, calls } = fakeClient({ orders: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getOrders", {
      startMs: START,
      endMs: END,
      status: "delivered",
    });

    expect(opsOf(calls, "eq")).toContainEqual(["status", "delivered"]);
    expect(windowBounds(calls)).toHaveLength(2);
  });

  it("refuses a window that is not a pair of finite instants", async () => {
    const { client } = fakeClient({ orders: [{ data: [], error: null }] });

    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrders", { startMs: "sep 3", endMs: END })
    ).rejects.toThrow(/epoch milliseconds/i);
  });
});

/** A valid uuid per index, for reads that take a list of order ids. */
function uuidAt(index: number): string {
  return `0000000${index % 10}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("runPlatformQuery — orders:getAllOrderItems bounded by order ids", () => {
  // The unbounded form is a 10k-row join every poll, on every device. Every
  // live screen already holds the orders it shows, so it names them instead.
  it("reads only the named orders' items", async () => {
    const { client, calls } = fakeClient({ order_items: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {
      orderIds: [ORDER_ID, OTHER_ORDER_ID],
    });

    expect(opsOf(calls, "in")).toEqual([["order_id", [ORDER_ID, OTHER_ORDER_ID]]]);
    expect(opsOf(calls, "eq")).toContainEqual(["orders.tenant_id", TENANT]);
  });

  it("makes no request at all for an empty order set", async () => {
    const { client, calls } = fakeClient({});

    const items = await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", { orderIds: [] });

    expect(items).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("drops ids this database cannot hold rather than sending them", async () => {
    const { client, calls } = fakeClient({ order_items: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {
      orderIds: [CONVEX_ORDER_ID, ORDER_ID, undefined],
    });

    expect(opsOf(calls, "in")).toEqual([["order_id", [ORDER_ID]]]);
  });

  it("splits a long id list into bounded requests and joins the answers", async () => {
    const ids = Array.from({ length: ORDER_ID_CHUNK_SIZE * 2 + 1 }, (_, i) => uuidAt(i));
    const { client, calls } = fakeClient({
      order_items: [
        { data: [{ id: "a", order_id: ids[0], menu_item_name: "A", quantity: 1, price: 1, subtotal: 1 }], error: null },
        { data: [{ id: "b", order_id: ids[200], menu_item_name: "B", quantity: 1, price: 1, subtotal: 1 }], error: null },
        { data: [{ id: "c", order_id: ids[400], menu_item_name: "C", quantity: 1, price: 1, subtotal: 1 }], error: null },
      ],
    });

    const items = (await runPlatformQuery(client, TENANT, "orders:getAllOrderItems", {
      orderIds: ids,
    })) as { _id: string }[];

    expect(calls).toHaveLength(3);
    expect(opsOf(calls, "in").map((op) => (op[1] as string[]).length)).toEqual([
      ORDER_ID_CHUNK_SIZE,
      ORDER_ID_CHUNK_SIZE,
      1,
    ]);
    expect(items.map((item) => item._id)).toEqual(["a", "b", "c"]);
  });
});

describe("runPlatformQuery — orders:getOrderPaymentsForOrders", () => {
  function paymentRow(orderId: string, id: string) {
    return {
      id,
      order_id: orderId,
      tenant_id: TENANT,
      kind: "charge",
      amount: "25",
      payment_method_id: null,
      payment_method_name: "Cash",
      reference: null,
      proof_url: null,
      proof_public_id: null,
      recorded_by: "cashier",
      outlet_id: null,
      note: null,
      created_at: "2026-09-21T10:00:00.000Z",
    };
  }

  it("is a supported ref", () => {
    expect(isPlatformRefSupported("orders:getOrderPaymentsForOrders")).toBe(true);
  });

  it("reads every named order's ledger in one tenant-scoped request", async () => {
    // One shift card used to mount one read PER ORDER, each polling — the
    // busiest endpoint in the 2026-09-20 saturation, at 30k requests.
    const { client, calls } = fakeClient({
      order_payments: [
        { data: [paymentRow(ORDER_ID, "p1"), paymentRow(OTHER_ORDER_ID, "p2")], error: null },
      ],
    });

    const rows = (await runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {
      orderIds: [ORDER_ID, OTHER_ORDER_ID],
    })) as { _id: string; orderId: string; amount: number }[];

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("order_payments");
    expect(opsOf(calls, "eq")).toEqual([["tenant_id", TENANT]]);
    expect(opsOf(calls, "in")).toEqual([["order_id", [ORDER_ID, OTHER_ORDER_ID]]]);
    expect(opsOf(calls, "order")).toEqual([["created_at", { ascending: true }]]);
    expect(rows).toEqual([
      expect.objectContaining({ _id: "p1", orderId: ORDER_ID, amount: 25 }),
      expect.objectContaining({ _id: "p2", orderId: OTHER_ORDER_ID, amount: 25 }),
    ]);
  });

  it("caps each request at the per-order ledger ceiling times the orders asked for", async () => {
    const { client, calls } = fakeClient({ order_payments: [{ data: [], error: null }] });

    await runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {
      orderIds: [ORDER_ID, OTHER_ORDER_ID],
    });

    expect(opsOf(calls, "limit")).toEqual([[ORDER_LEDGER_LIMIT * 2]]);
  });

  it("reads nothing for an explicitly empty id list", async () => {
    const { client, calls } = fakeClient({});

    expect(
      await runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", { orderIds: [] })
    ).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("splits a long id list into bounded requests", async () => {
    const ids = Array.from({ length: ORDER_ID_CHUNK_SIZE + 1 }, (_, i) => uuidAt(i));
    const { client, calls } = fakeClient({
      order_payments: [
        { data: [paymentRow(ids[0], "p1")], error: null },
        { data: [paymentRow(ids[200], "p2")], error: null },
      ],
    });

    const rows = (await runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {
      orderIds: ids,
    })) as { _id: string }[];

    expect(calls).toHaveLength(2);
    expect(rows.map((row) => row._id)).toEqual(["p1", "p2"]);
  });

  it("refuses a request that filled its shared cap rather than returning a trimmed ledger", async () => {
    // The cap is shared across the chunk: a full page may have dropped rows
    // from any order in it, and the screen cannot tell which.
    const { client } = fakeClient({
      order_payments: [
        { data: Array.from({ length: ORDER_LEDGER_LIMIT * 2 }, (_, i) => paymentRow(ORDER_ID, `p${i}`)), error: null },
      ],
    });

    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {
        orderIds: [ORDER_ID, OTHER_ORDER_ID],
      })
    ).rejects.toThrow(/incomplete/);
  });

  it("surfaces a read failure instead of an empty ledger", async () => {
    const { client } = fakeClient({
      order_payments: [{ data: null, error: { message: "statement timeout" } }],
    });

    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", { orderIds: [ORDER_ID] })
    ).rejects.toThrow("statement timeout");
  });
});

describe("runPlatformQuery — orders:getOrderPaymentsForOrders refuses a malformed ask", () => {
  // An empty ledger reads on screen as "this shift is reconciled". A caller
  // that forgets `orderIds`, or hands over ids this database cannot hold,
  // must not be answered with silence — the drawer's own doctrine is that no
  // drawer beats a drawer reconciled against a ledger that isn't all there.
  it("refuses when orderIds is missing entirely", async () => {
    const { client } = fakeClient({});

    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {})
    ).rejects.toThrow(/orderIds/i);
  });

  it("refuses when every id given is one this database cannot hold", async () => {
    const { client } = fakeClient({});

    await expect(
      runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", {
        orderIds: [CONVEX_ORDER_ID],
      })
    ).rejects.toThrow(/orderIds/i);
  });

  it("still answers an explicitly empty shift with an empty ledger", async () => {
    // Nothing was asked about, so nothing is the complete answer.
    const { client, calls } = fakeClient({});

    expect(
      await runPlatformQuery(client, TENANT, "orders:getOrderPaymentsForOrders", { orderIds: [] })
    ).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
