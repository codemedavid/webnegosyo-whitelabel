import {
  applyOrderEdits,
  findQueuedSale,
  localOrderItems,
  localPaymentsFor,
  mergeOrderList,
  mergeRealtimeQueue,
  queuedSaleToOrder,
  type OfflineOrderInput,
} from "./offline-order-view";
import { MAX_SYNC_ATTEMPTS, type QueuedSale } from "./order-outbox";
import type { QueuedOrderEdit } from "./order-edits";

function sale(localId: string, overrides: Partial<QueuedSale> = {}): QueuedSale {
  return {
    localId,
    tenantId: "tenant-1",
    backend: "platform",
    clientOrderId: `pos-${localId}`,
    createdAt: 5_000,
    orderArgs: {
      customerName: "Walk-in",
      customerContact: "0917",
      customerData: { outlet_id: "branch-a", pos: { cashierId: "u1" } },
      total: 250,
      itemCount: 2,
      orderType: "Dine in",
      source: "pos",
      paymentMethod: "Cash",
      items: [
        { menuItemId: "m1", menuItemName: "Adobo", quantity: 2, price: 125, subtotal: 250 },
      ],
    },
    bookkeeping: {
      stockItems: [],
      loyverseLines: [],
      discountLines: [],
      outletId: "branch-a",
      total: 250,
      customerName: "Walk-in",
      customerContact: "0917",
      customerData: {},
      channel: null,
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
    paidAtTender: true,
    ...overrides,
  };
}

function edit(editId: string, overrides: Partial<QueuedOrderEdit> = {}): QueuedOrderEdit {
  return {
    editId,
    tenantId: "tenant-1",
    backend: "platform",
    orderId: "local-1",
    ref: "orders:updateOrderStatus",
    args: { orderId: "local-1", status: "preparing" },
    createdAt: 6_000,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

function input(overrides: Partial<OfflineOrderInput> = {}): OfflineOrderInput {
  return { sales: [], edits: [], tenantId: "tenant-1", ...overrides };
}

describe("queuedSaleToOrder", () => {
  it("presents a queued counter sale as a confirmed order", () => {
    const order = queuedSaleToOrder(sale("local-1"));

    expect(order).toMatchObject({
      _id: "local-1",
      _creationTime: 5_000,
      customerName: "Walk-in",
      total: 250,
      itemCount: 2,
      status: "confirmed",
      source: "pos",
      paymentStatus: "paid",
      dailyNumber: null,
      offlineSync: "queued",
    });
    expect(order.items).toHaveLength(1);
    expect(order.customerData).toEqual({ outlet_id: "branch-a", pos: { cashierId: "u1" } });
  });

  it("keeps a pay-later sale unpaid", () => {
    expect(queuedSaleToOrder(sale("local-1", { paidAtTender: false })).paymentStatus).toBe("pending");
  });

  it("uses the server id once the sale has been written", () => {
    expect(queuedSaleToOrder(sale("local-1", { syncedOrderId: "convex-9" }))._id).toBe("convex-9");
  });

  it("flags a sale the server keeps refusing", () => {
    const order = queuedSaleToOrder(sale("local-1", { attempts: MAX_SYNC_ATTEMPTS, lastError: "nope" }));
    expect(order.offlineSync).toBe("needs_attention");
    expect(order.offlineSyncError).toBe("nope");
  });
});

describe("applyOrderEdits", () => {
  const order = { _id: "local-1", status: "confirmed", paymentStatus: "pending" };

  it("replays status and payment changes in the order they were made", () => {
    const result = applyOrderEdits(order, [
      edit("e2", { createdAt: 7_000, args: { orderId: "local-1", status: "ready" } }),
      edit("e1", { createdAt: 6_000, args: { orderId: "local-1", status: "preparing" } }),
      edit("e3", {
        createdAt: 8_000,
        ref: "orders:updatePaymentStatus",
        args: { orderId: "local-1", paymentStatus: "paid" },
      }),
    ]);

    expect(result).toMatchObject({ status: "ready", paymentStatus: "paid", offlineSync: "queued" });
    expect(order.status).toBe("confirmed");
  });

  it("returns the same object when nothing applies", () => {
    expect(applyOrderEdits(order, [edit("e1", { orderId: "other" })])).toBe(order);
  });

  it("adds payments collected offline to the amount paid", () => {
    const result = applyOrderEdits({ ...order, amountPaid: 50 }, [
      edit("e1", { ref: "orders:recordPayment", args: { orderId: "local-1", kind: "charge", amount: 100 } }),
    ]);
    expect(result.amountPaid).toBe(150);
  });
});

describe("mergeOrderList", () => {
  it("adds this store's queued sales to the server list, newest first", () => {
    const server = [{ _id: "s1", _creationTime: 9_000, status: "pending" }];
    const merged = mergeOrderList(server, input({
      sales: [sale("local-1"), sale("other-store", { tenantId: "tenant-2" })],
    }));

    expect(merged.map((o) => o._id)).toEqual(["s1", "local-1"]);
  });

  it("never shows a sale twice once the server has it", () => {
    const server = [{ _id: "local-1", _creationTime: 5_000, status: "confirmed" }];
    const merged = mergeOrderList(server, input({ sales: [sale("local-1", { syncedOrderId: "local-1" })] }));

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(server[0]);
  });

  it("lays pending changes over server orders", () => {
    const server = [{ _id: "s1", _creationTime: 9_000, status: "confirmed" }];
    const merged = mergeOrderList(server, input({
      edits: [edit("e1", { orderId: "s1", args: { orderId: "s1", status: "cancelled" } })],
    }));

    expect(merged[0]).toMatchObject({ _id: "s1", status: "cancelled", offlineSync: "queued" });
  });

  it("keeps only queued sales inside a dated window", () => {
    const merged = mergeOrderList([], input({
      sales: [sale("early", { createdAt: 1_000 }), sale("inside", { createdAt: 5_000 })],
      window: { startMs: 2_000, endMs: 10_000 },
    }));

    expect(merged.map((o) => o._id)).toEqual(["inside"]);
  });

  it("shows queued sales even when the server list never arrived", () => {
    expect(mergeOrderList(undefined, input({ sales: [sale("local-1")] })).map((o) => o._id)).toEqual(["local-1"]);
  });

  it("filters to a status when the screen asked for one", () => {
    const merged = mergeOrderList([], input({
      sales: [sale("local-1")],
      status: "pending",
    }));
    expect(merged).toEqual([]);
  });
});

describe("mergeRealtimeQueue", () => {
  type Row = { _id: string; _creationTime: number; status: string };
  it("files queued sales and moved orders under their current status", () => {
    const queue: Record<string, Row[]> = {
      pending: [{ _id: "s1", _creationTime: 9_000, status: "pending" }],
      confirmed: [],
      preparing: [],
      ready: [],
    };
    const merged = mergeRealtimeQueue(queue, input({
      sales: [sale("local-1")],
      edits: [edit("e1", { orderId: "s1", args: { orderId: "s1", status: "preparing" } })],
    }));

    expect(merged?.pending).toEqual([]);
    expect(merged?.confirmed?.map((o) => o._id)).toEqual(["local-1"]);
    expect(merged?.preparing?.map((o) => o._id)).toEqual(["s1"]);
  });

  it("drops an order that was closed offline from the open queue", () => {
    const empty: Record<string, Row[]> = { pending: [], confirmed: [], preparing: [], ready: [] };
    const merged = mergeRealtimeQueue(
      empty,
      input({
        sales: [sale("local-1")],
        edits: [edit("e1", { args: { orderId: "local-1", status: "delivered" } })],
      })
    );

    expect(Object.values(merged ?? {}).flat()).toEqual([]);
  });

  it("builds a queue from queued sales alone when the server never answered", () => {
    const merged = mergeRealtimeQueue<Row>(undefined, input({ sales: [sale("local-1")] }));
    expect(merged?.confirmed?.map((o) => o._id)).toEqual(["local-1"]);
  });

  it("returns the server queue untouched when nothing is waiting", () => {
    const queue: Record<string, Row[]> = { pending: [] };
    expect(mergeRealtimeQueue(queue, input())).toBe(queue);
  });
});

describe("localOrderItems", () => {
  it("exposes queued sale lines keyed by their order id", () => {
    expect(localOrderItems(input({ sales: [sale("local-1")] }))).toEqual([
      expect.objectContaining({ orderId: "local-1", menuItemName: "Adobo", quantity: 2 }),
    ]);
  });
});

describe("localPaymentsFor", () => {
  it("lists payments collected offline as ledger rows", () => {
    const rows = localPaymentsFor("local-1", [
      edit("e1", {
        ref: "orders:recordPayment",
        args: { orderId: "local-1", kind: "charge", amount: 250, paymentMethodName: "Cash", reference: "r1" },
      }),
      edit("e2", { ref: "orders:updatePaymentStatus", args: { orderId: "local-1", paymentStatus: "paid" } }),
    ]);

    expect(rows).toEqual([
      {
        _id: "offline:e1",
        _creationTime: 6_000,
        kind: "charge",
        amount: 250,
        paymentMethodName: "Cash",
        reference: "r1",
        note: undefined,
      },
    ]);
  });
});

describe("findQueuedSale", () => {
  it("finds a sale by its device id or its server id", () => {
    const sales = [sale("local-1", { syncedOrderId: "convex-9" })];
    expect(findQueuedSale(sales, "local-1")?.localId).toBe("local-1");
    expect(findQueuedSale(sales, "convex-9")?.localId).toBe("local-1");
    expect(findQueuedSale(sales, "nope")).toBeUndefined();
  });
});
