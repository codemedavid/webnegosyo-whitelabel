import {
  localDayStartMs,
  toOrderDto,
  toOrderItemDto,
  toOrderWithItems,
  groupRealtimeQueue,
  summarizeDashboardStats,
  buildCreateOrderRows,
  type PlatformOrderRow,
  type PlatformOrderItemRow,
} from "./supabase-orders";

/**
 * The merchant app talks to Convex through string function refs. For tenants on
 * the shared platform Supabase there is no Convex deployment, so these mappers
 * must produce the exact DTO shape the screens already consume — `_id`,
 * `_creationTime` (epoch ms) and camelCase fields — from snake_case SQL rows.
 * The screens are the contract; they do not change.
 */

function orderRow(overrides: Partial<PlatformOrderRow> = {}): PlatformOrderRow {
  return {
    id: "order-1",
    tenant_id: "tenant-1",
    customer_name: "Ana",
    customer_contact: "09171234567",
    customer_data: null,
    total: 250,
    item_count: 3,
    status: "pending",
    source: "web",
    order_type: "Delivery",
    order_type_id: null,
    payment_status: "pending",
    payment_method_name: null,
    payment_method_details: null,
    delivery_fee: null,
    scheduled_for: null,
    client_order_id: null,
    created_at: "2026-07-27T02:00:00.000Z",
    updated_at: "2026-07-27T02:00:00.000Z",
    ...overrides,
  };
}

function itemRow(
  overrides: Partial<PlatformOrderItemRow> = {}
): PlatformOrderItemRow {
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

describe("localDayStartMs", () => {
  it("starts the day at Manila midnight, not UTC midnight", () => {
    // Arrange: 2026-07-27 02:00 UTC is 10:00 on the 27th in Manila (UTC+8).
    const atMs = Date.parse("2026-07-27T02:00:00.000Z");

    // Act
    const start = localDayStartMs(atMs);

    // Assert: the local day began at 16:00 UTC on the 26th.
    expect(new Date(start).toISOString()).toBe("2026-07-26T16:00:00.000Z");
  });

  it("keeps an order placed just after Manila midnight inside today", () => {
    // Arrange: 00:30 Manila on the 27th == 16:30 UTC on the 26th. A UTC-based
    // boundary would push this into "yesterday" and lose the first 8 hours of
    // the merchant's trading day.
    const justAfterLocalMidnight = Date.parse("2026-07-26T16:30:00.000Z");

    // Act
    const start = localDayStartMs(justAfterLocalMidnight);

    // Assert
    expect(justAfterLocalMidnight).toBeGreaterThanOrEqual(start);
  });
});

describe("toOrderDto — prep time", () => {
  it("carries the kitchen's prep promise onto the DTO", () => {
    // `toOrderDto` is an explicit field-by-field projection: a column not named
    // here vanishes on every platform-backend tenant with no error at all. The
    // board would then show no promised time no matter what the chef tapped.
    const row = orderRow({
      prep_minutes: 15,
      promised_ready_at: "2026-07-27T02:15:00.000Z",
    });

    const dto = toOrderDto(row);

    expect(dto.prepMinutes).toBe(15);
    expect(dto.promisedReadyAt).toBe("2026-07-27T02:15:00.000Z");
  });

  it("leaves both fields undefined for an order the kitchen never timed", () => {
    const dto = toOrderDto(orderRow({ prep_minutes: null, promised_ready_at: null }));

    expect(dto.prepMinutes).toBeUndefined();
    expect(dto.promisedReadyAt).toBeUndefined();
  });
});

describe("toOrderDto", () => {
  it("maps a SQL row onto the Convex DTO shape the screens consume", () => {
    // Arrange
    const row = orderRow();

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto._id).toBe("order-1");
    expect(dto._creationTime).toBe(Date.parse("2026-07-27T02:00:00.000Z"));
    expect(dto.customerName).toBe("Ana");
    expect(dto.customerContact).toBe("09171234567");
    expect(dto.itemCount).toBe(3);
    expect(dto.orderType).toBe("Delivery");
    expect(dto.paymentStatus).toBe("pending");
    expect(dto.source).toBe("web");
  });

  it("carries the delivery address and every Lalamove field onto the DTO", () => {
    // Arrange: a delivery order that was quoted at checkout and later booked.
    // `LalamoveDeliveryCard` renders off exactly these fields; a dropped
    // projection leaves a platform-backed store with no Lalamove UI at all —
    // no Book button, no status, no tracking link.
    const row = orderRow({
      delivery_address: "12 Mabini St, Quezon City",
      lalamove_quotation_id: "quote-1",
      lalamove_order_id: "lala-1",
      lalamove_status: "ON_GOING",
      lalamove_driver_name: "Rico",
      lalamove_driver_phone: "09998887777",
      lalamove_tracking_url: "https://share.lalamove.com/lala-1",
    });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.deliveryAddress).toBe("12 Mabini St, Quezon City");
    expect(dto.lalamoveQuotationId).toBe("quote-1");
    expect(dto.lalamoveOrderId).toBe("lala-1");
    expect(dto.lalamoveStatus).toBe("ON_GOING");
    expect(dto.lalamoveDriverName).toBe("Rico");
    expect(dto.lalamoveDriverPhone).toBe("09998887777");
    expect(dto.lalamoveTrackingUrl).toBe("https://share.lalamove.com/lala-1");
  });

  it("reads the delivery address from the customer_data blob on a platform row", () => {
    // Arrange: the platform `orders` table has NO delivery_address column —
    // web checkout keeps the address inside customer_data. Reading only the
    // column left every platform delivery order without an address on the
    // order screen, and left the Lalamove card with nothing to quote.
    const row = orderRow({
      customer_data: { delivery_address: "Enverga Blvd, Lucena", delivery_lat: "13.94" },
    });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.deliveryAddress).toBe("Enverga Blvd, Lucena");
  });

  it("leaves the Lalamove fields undefined on an order that was never quoted", () => {
    // Arrange: a counter sale. The card keys off these being absent to hide
    // itself, so an empty string here would show a Lalamove panel on a walk-in.
    const row = orderRow();

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.lalamoveQuotationId).toBeUndefined();
    expect(dto.lalamoveOrderId).toBeUndefined();
    expect(dto.deliveryAddress).toBeUndefined();
  });

  it("coerces numeric columns that Postgres returns as strings", () => {
    // Arrange: `numeric` comes back as a string over PostgREST, which would
    // make totals concatenate instead of add.
    const row = orderRow({ total: "250.50" as unknown as number });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.total).toBe(250.5);
  });

  it("falls back to a blank customer name rather than rendering undefined", () => {
    // Arrange
    const row = orderRow({ customer_name: null });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.customerName).toBe("");
  });

  it("derives itemCount from the line items when the column is unset", () => {
    // Arrange: rows written before item_count existed.
    const row = orderRow({ item_count: null });

    // Act
    const dto = toOrderDto(row, [itemRow({ quantity: 2 }), itemRow({ id: "item-2", quantity: 5 })]);

    // Assert
    expect(dto.itemCount).toBe(7);
  });

  /**
   * The edit screen feeds `revisionNumber` into the optimistic lock that
   * protects a real customer's bill from two cashiers saving at once. If the
   * read path drops the column, every edit submits revision 0 and the second
   * save on any order is refused with a concurrency message that is false.
   */
  it("carries the revision number the optimistic lock is checked against", () => {
    // Arrange
    const row = orderRow({ revision_number: 2 });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.revisionNumber).toBe(2);
  });

  it("reads an order never edited as revision 0, not undefined", () => {
    // Arrange: every order placed before the ledger migration.
    const row = orderRow({ revision_number: null });

    // Act
    const dto = toOrderDto(row);

    // Assert: `undefined` would silently become 0 in the session anyway, but
    // only after the screen had already rendered a blank "revision —".
    expect(dto.revisionNumber).toBe(0);
  });

  /**
   * `amount_paid` is the trigger-maintained cache of the settlement ledger.
   * Without it the edit screen cannot show "was / now / still owing" before the
   * ledger query resolves.
   */
  it("carries the amount already paid", () => {
    // Arrange
    const row = orderRow({ amount_paid: 110 });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.amountPaid).toBe(110);
  });

  it("coerces amount_paid from the string PostgREST returns for numeric", () => {
    // Arrange
    const row = orderRow({ amount_paid: "110.50" as unknown as number });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.amountPaid).toBe(110.5);
  });

  it("reads an unpaid order as 0 paid, so it is never mistaken for settled", () => {
    // Arrange
    const row = orderRow({ amount_paid: null });

    // Act
    const dto = toOrderDto(row);

    // Assert
    expect(dto.amountPaid).toBe(0);
  });
});

describe("toOrderItemDto", () => {
  it("maps line-item columns to the camelCase names the detail screen reads", () => {
    // Arrange
    const row = itemRow({
      special_instructions: "no sugar",
      is_upsell_item: true,
      bundle_name: "Combo A",
    });

    // Act
    const dto = toOrderItemDto(row);

    // Assert
    expect(dto.menuItemName).toBe("Latte");
    expect(dto.specialInstructions).toBe("no sugar");
    expect(dto.isUpsellItem).toBe(true);
    expect(dto.bundleName).toBe("Combo A");
    expect(dto.subtotal).toBe(240);
  });

  it("normalizes legacy string addons into the object shape", () => {
    // Arrange: `order_items.addons` is a text[] on older rows.
    const row = itemRow({ addons: ["Extra shot"] as unknown as PlatformOrderItemRow["addons"] });

    // Act
    const dto = toOrderItemDto(row);

    // Assert
    expect(dto.addons).toEqual([{ name: "Extra shot", price: 0 }]);
  });

  it("returns an empty addon list when the column is null", () => {
    // Arrange
    const row = itemRow({ addons: null });

    // Act
    const dto = toOrderItemDto(row);

    // Assert
    expect(dto.addons).toEqual([]);
  });

  it("carries the parent order id, as Convex order items do", () => {
    // Arrange: product analytics joins items back to their order's date, so an
    // item without `orderId` cannot be attributed to a day.
    const row = itemRow({ order_id: "order-42" });

    // Act
    const dto = toOrderItemDto(row);

    // Assert
    expect(dto.orderId).toBe("order-42");
  });
});

describe("toOrderWithItems", () => {
  it("nests mapped items under the order, as getOrderById does", () => {
    // Arrange
    const row = orderRow();
    const items = [itemRow(), itemRow({ id: "item-2", menu_item_name: "Bagel" })];

    // Act
    const dto = toOrderWithItems(row, items);

    // Assert
    expect(dto.items).toHaveLength(2);
    expect(dto.items[1].menuItemName).toBe("Bagel");
    expect(dto._id).toBe("order-1");
  });
});

describe("groupRealtimeQueue", () => {
  it("buckets open orders by status and drops closed ones", () => {
    // Arrange
    const rows = [
      orderRow({ id: "a", status: "pending" }),
      orderRow({ id: "b", status: "preparing" }),
      orderRow({ id: "c", status: "delivered" }),
      orderRow({ id: "d", status: "cancelled" }),
    ];

    // Act
    const queue = groupRealtimeQueue(rows);

    // Assert
    expect(queue.pending.map((o) => o._id)).toEqual(["a"]);
    expect(queue.preparing.map((o) => o._id)).toEqual(["b"]);
    expect(queue.confirmed).toEqual([]);
    expect(queue.ready).toEqual([]);
    expect(Object.keys(queue)).toEqual(["pending", "confirmed", "preparing", "ready"]);
  });

  it("orders each bucket newest first", () => {
    // Arrange
    const rows = [
      orderRow({ id: "older", created_at: "2026-07-27T01:00:00.000Z" }),
      orderRow({ id: "newer", created_at: "2026-07-27T03:00:00.000Z" }),
    ];

    // Act
    const queue = groupRealtimeQueue(rows);

    // Assert
    expect(queue.pending.map((o) => o._id)).toEqual(["newer", "older"]);
  });
});

describe("summarizeDashboardStats", () => {
  it("excludes cancelled orders from revenue, count and average", () => {
    // Arrange
    const rows = [
      orderRow({ id: "a", total: 100, status: "delivered" }),
      orderRow({ id: "b", total: 300, status: "ready" }),
      orderRow({ id: "c", total: 999, status: "cancelled" }),
    ];

    // Act
    const stats = summarizeDashboardStats(rows);

    // Assert
    expect(stats.totalOrders).toBe(2);
    expect(stats.totalRevenue).toBe(400);
    expect(stats.avgOrderValue).toBe(200);
  });

  it("still counts cancelled orders in the status breakdown", () => {
    // Arrange
    const rows = [orderRow({ status: "cancelled" }), orderRow({ id: "b", status: "pending" })];

    // Act
    const stats = summarizeDashboardStats(rows);

    // Assert
    expect(stats.statusCounts.cancelled).toBe(1);
    expect(stats.statusCounts.pending).toBe(1);
    expect(stats.statusCounts.delivered).toBe(0);
  });

  it("returns a zero average instead of NaN when nothing sold", () => {
    // Arrange
    const rows: PlatformOrderRow[] = [];

    // Act
    const stats = summarizeDashboardStats(rows);

    // Assert
    expect(stats.avgOrderValue).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.totalOrders).toBe(0);
  });

  it("ignores an unrecognized status rather than producing NaN counts", () => {
    // Arrange
    const rows = [orderRow({ status: "refunded" })];

    // Act
    const stats = summarizeDashboardStats(rows);

    // Assert
    expect(Object.values(stats.statusCounts).every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe("buildCreateOrderRows", () => {
  const args = {
    customerName: "Ana",
    customerContact: "09171234567",
    total: 240,
    itemCount: 2,
    source: "web" as const,
    items: [
      {
        menuItemId: "menu-1",
        menuItemName: "Latte",
        quantity: 2,
        price: 120,
        subtotal: 240,
      },
    ],
  };

  it("opens a web order in the pending queue awaiting merchant approval", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", args);

    // Assert
    expect(order.status).toBe("pending");
    expect(order.tenant_id).toBe("tenant-1");
    expect(order.payment_status).toBe("pending");
  });

  it("confirms counter sales on arrival, matching the Convex skip-pending rule", () => {
    // Arrange: POS and QR-handoff orders are rung up by the merchant, so there
    // is nobody left to approve them.
    // Act
    const pos = buildCreateOrderRows("tenant-1", { ...args, source: "pos" });
    const qr = buildCreateOrderRows("tenant-1", { ...args, source: "qr_handoff" });

    // Assert
    expect(pos.order.status).toBe("confirmed");
    expect(qr.order.status).toBe("confirmed");
  });

  it("writes line items in snake_case for the order_items table", () => {
    // Act
    const { items } = buildCreateOrderRows("tenant-1", args);

    // Assert
    expect(items).toHaveLength(1);
    expect(items[0].menu_item_name).toBe("Latte");
    expect(items[0].subtotal).toBe(240);
  });

  /**
   * `order_items.addons` on the platform is `text[] NOT NULL`. A `null` here
   * meant the order row landed and the items insert was refused — a POS sale
   * that showed up with no line items. Objects are refused by a text[] too.
   */
  it("writes addons as a non-null array of names for the text[] column", () => {
    const bare = buildCreateOrderRows("tenant-1", args);
    expect(bare.items[0].addons).toEqual([]);

    const withAddons = buildCreateOrderRows("tenant-1", {
      ...args,
      items: [{ ...args.items[0], addons: [{ name: "Extra shot", price: 20 }] }],
    });
    expect(withAddons.items[0].addons).toEqual(["Extra shot"]);
  });

  it("carries the scheduled time onto the real column for advance orders", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", {
      ...args,
      scheduledFor: "2026-07-28T02:00:00.000Z",
    });

    // Assert
    expect(order.scheduled_for).toBe("2026-07-28T02:00:00.000Z");
  });

  it("keeps the client order id so a retried submit can be deduped", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", { ...args, clientOrderId: "abc-123" });

    // Assert
    expect(order.client_order_id).toBe("abc-123");
  });

  it("flags upsell and bundle orders from their line items", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", {
      ...args,
      items: [{ ...args.items[0], isUpsellItem: true }],
    });

    // Assert
    expect(order.has_upsell_items).toBe(true);
    expect(order.has_bundle_items).toBe(false);
  });
});

/**
 * The register stamps the branch into `customerData` — the only carrier Convex
 * and tenant-owned projects have. The platform database also has a real
 * `outlet_id` column, and once order reads are narrowed by it server-side, a
 * counter sale that filled only the blob becomes invisible to the very branch
 * that rang it up. So the column is filled from the blob here, at the one place
 * every platform order is built.
 */
describe("buildCreateOrderRows branch attribution", () => {
  const args = {
    customerName: "Walk-in",
    customerContact: "",
    total: 100,
    itemCount: 1,
    source: "pos" as const,
    items: [
      {
        menuItemId: "menu-1",
        menuItemName: "Latte",
        quantity: 1,
        price: 100,
        subtotal: 100,
      },
    ],
  };

  it("fills the outlet_id column from the branch in customerData", () => {
    // Arrange: what `buildPosOrder` produces for a branch register.
    // Act
    const { order } = buildCreateOrderRows("tenant-1", {
      ...args,
      customerData: { outlet_id: "outlet-north", outlet_name: "North Branch" },
    });

    // Assert
    expect(order.outlet_id).toBe("outlet-north");
  });

  it("keeps the branch in customerData as well, for the other backends", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", {
      ...args,
      customerData: { outlet_id: "outlet-north", outlet_name: "North Branch" },
    });

    // Assert
    expect(order.customer_data).toMatchObject({ outlet_id: "outlet-north" });
  });

  it("leaves outlet_id null for a single-location register", () => {
    // Act
    const { order } = buildCreateOrderRows("tenant-1", args);

    // Assert: a store with no branches must write exactly what it writes today.
    expect(order.outlet_id).toBeNull();
  });

  it("ignores a blank or non-string branch in the blob", () => {
    // Arrange: a malformed blob must not produce an empty-string foreign key,
    // which Postgres would reject as an invalid uuid and fail the whole sale.
    // Act
    const blank = buildCreateOrderRows("tenant-1", {
      ...args,
      customerData: { outlet_id: "   " },
    });
    const wrongType = buildCreateOrderRows("tenant-1", {
      ...args,
      customerData: { outlet_id: 42 },
    });

    // Assert
    expect(blank.order.outlet_id).toBeNull();
    expect(wrongType.order.outlet_id).toBeNull();
  });
});

describe("buildCreateOrderRows — delivery details", () => {
  const args = {
    customerName: "Ana",
    customerContact: "09171234567",
    total: 290,
    itemCount: 2,
    source: "pos" as const,
    deliveryFee: 50,
    customerData: { delivery_address: "12 Mabini St", customer_phone: "0917 000 1234" },
    items: [
      { menuItemId: "menu-1", menuItemName: "Latte", quantity: 2, price: 120, subtotal: 240 },
    ],
  };

  it("stores the fee in the breakdown column", () => {
    expect(buildCreateOrderRows("tenant-1", args).order.delivery_fee).toBe(50);
  });

  it("never writes a delivery_address column — the platform table has none", () => {
    // PostgREST refuses an insert naming a column the table does not have
    // (PGRST204), which would fail the whole register sale. The address
    // lives in customer_data, which is where every platform reader looks.
    const { order } = buildCreateOrderRows("tenant-1", args);
    expect("delivery_address" in order).toBe(false);
    expect(order.customer_data).toMatchObject({ delivery_address: "12 Mabini St" });
  });
});

import { getOrderOutletId } from "../branch-scope";

describe("branch attribution on the order DTO", () => {
  /**
   * The server narrows branch reads on the `outlet_id` COLUMN, but the DTO the
   * client re-filters (and the chime gate reads) used to drop it — so an order
   * whose branch lived only in the column rang the alert yet never appeared in
   * a branch account's queue. The DTO must carry the column through.
   */
  it("carries outlet_id through toOrderDto so client-side scoping sees it", () => {
    const dto = toOrderDto(orderRow({ outlet_id: "outlet-north" }));

    expect(getOrderOutletId(dto)).toBe("outlet-north");
  });

  it("still attributes blob-only rows through customer_data", () => {
    const dto = toOrderDto(
      orderRow({ outlet_id: null, customer_data: { outlet_id: "outlet-south" } })
    );

    expect(getOrderOutletId(dto)).toBe("outlet-south");
  });

  it("leaves a single-location order unattributed", () => {
    expect(getOrderOutletId(toOrderDto(orderRow()))).toBeNull();
  });
});

describe("service charge — stored, projected, and readable", () => {
  /**
   * The platform `orders` table has carried a `service_charge_amount` column
   * since the order-types migration, and the web admin has always written and
   * read it. The merchant app did neither: the register folded the charge into
   * `total` and threw the figure away, so every serviced order arrived at the
   * order screen and the printer as an unexplained gap between the items and
   * the bill. These lock both halves of the round trip.
   */
  const args = {
    customerName: "Ana",
    customerContact: "09171234567",
    total: 264,
    itemCount: 2,
    source: "pos" as const,
    serviceCharge: 24,
    items: [
      { menuItemId: "menu-1", menuItemName: "Latte", quantity: 2, price: 120, subtotal: 240 },
    ],
  };

  it("writes the charge the total was computed with", () => {
    expect(buildCreateOrderRows("tenant-1", args).order.service_charge_amount).toBe(24);
  });

  it("writes NULL rather than zero for an unserviced sale", () => {
    // Matching `delivery_fee`: a stored 0 and an absent charge are the same
    // bill, and NULL is what the web checkout path already writes.
    const { order } = buildCreateOrderRows("tenant-1", { ...args, serviceCharge: 0 });

    expect(order.service_charge_amount).toBeNull();
  });

  it("projects the stored charge onto the DTO", () => {
    const dto = toOrderDto(orderRow({ service_charge_amount: 24 }));

    expect(dto.serviceCharge).toBe(24);
  });

  it("leaves the charge undefined when the column is NULL", () => {
    // An unserviced order must not surface a zero row on the receipt.
    expect(toOrderDto(orderRow({ service_charge_amount: null })).serviceCharge).toBeUndefined();
  });

  it("reads a numeric string, as the driver returns numerics", () => {
    // `delivery_fee` needed the same coercion — Postgres numerics arrive as
    // strings, and a string amount would print as "P[object]" on the chit.
    const dto = toOrderDto(orderRow({ service_charge_amount: "24.50" as unknown as number }));

    expect(dto.serviceCharge).toBe(24.5);
  });
});
