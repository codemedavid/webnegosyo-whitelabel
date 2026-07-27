import {
  selectIncomingOrders,
  countUnseenIncoming,
  formatIncomingHandle,
  describeIncomingOrder,
  INCOMING_LIMIT,
  type IncomingOrder,
  type RealtimeQueue,
} from "./pos-incoming";

function order(
  id: string,
  createdAt: number,
  extra: Partial<IncomingOrder> = {},
): IncomingOrder {
  return { _id: id, _creationTime: createdAt, source: "web", ...extra };
}

describe("selectIncomingOrders", () => {
  it("returns nothing while the queue is still loading", () => {
    // Arrange
    const queue: RealtimeQueue = undefined;

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result).toEqual([]);
  });

  it("flattens every open status into one feed", () => {
    // Arrange: an order the kitchen already started is still "incoming" to the
    // cashier — it arrived from somewhere other than this register.
    const queue: RealtimeQueue = {
      pending: [order("a", 3)],
      confirmed: [order("b", 2)],
      preparing: [order("c", 1)],
      ready: [order("d", 0)],
    };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result.map((o) => o._id)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops the register's own counter sales", () => {
    // Arrange: the cashier just rang up "b" at this very screen. Showing it
    // back to them as an "incoming order" would be a lie.
    const queue: RealtimeQueue = {
      pending: [order("a", 2), order("b", 1, { source: "pos" })],
    };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result.map((o) => o._id)).toEqual(["a"]);
  });

  it("keeps orders whose source is unknown", () => {
    // Arrange: an older row written before `source` was recorded. It is not
    // provably a counter sale, and hiding a real order is the worse failure.
    const queue: RealtimeQueue = { pending: [{ _id: "a", _creationTime: 1 }] };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result.map((o) => o._id)).toEqual(["a"]);
  });

  it("sorts newest first across statuses", () => {
    // Arrange
    const queue: RealtimeQueue = {
      pending: [order("old", 100)],
      ready: [order("newest", 900)],
      confirmed: [order("middle", 500)],
    };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result.map((o) => o._id)).toEqual(["newest", "middle", "old"]);
  });

  it("shows an order once even when it appears under two statuses", () => {
    // Arrange: a status change between the two reads of a polled backend can
    // land the same row in both buckets.
    const queue: RealtimeQueue = {
      pending: [order("a", 5)],
      confirmed: [order("a", 5)],
    };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result).toHaveLength(1);
  });

  it("caps the feed so a backlog cannot render unbounded rows", () => {
    // Arrange
    const queue: RealtimeQueue = {
      pending: Array.from({ length: INCOMING_LIMIT + 10 }, (_, i) => order(`o${i}`, i)),
    };

    // Act
    const result = selectIncomingOrders(queue);

    // Assert
    expect(result).toHaveLength(INCOMING_LIMIT);
  });

  it("honours an explicit limit", () => {
    const queue: RealtimeQueue = {
      pending: [order("a", 3), order("b", 2), order("c", 1)],
    };
    expect(selectIncomingOrders(queue, 2).map((o) => o._id)).toEqual(["a", "b"]);
  });

  it("tolerates a status bucket that is missing or not an array", () => {
    // Arrange: a backend bundle older than this app may omit buckets entirely.
    const queue = { pending: undefined, ready: null } as unknown as RealtimeQueue;

    // Act + Assert
    expect(selectIncomingOrders(queue)).toEqual([]);
  });
});

describe("countUnseenIncoming", () => {
  const a = order("a", 2);
  const b = order("b", 1);

  it("counts nothing on the first snapshot so the badge never opens dirty", () => {
    expect(countUnseenIncoming(null, [a, b])).toBe(0);
  });

  it("counts only ids the cashier has not acknowledged", () => {
    expect(countUnseenIncoming(new Set(["a"]), [a, b])).toBe(1);
  });

  it("returns zero once everything on screen has been seen", () => {
    expect(countUnseenIncoming(new Set(["a", "b"]), [a, b])).toBe(0);
  });
});

describe("formatIncomingHandle", () => {
  it("calls out unseen orders so a glance is enough", () => {
    expect(formatIncomingHandle(2, 5)).toBe("2 new orders");
  });

  it("uses the singular for one unseen order", () => {
    expect(formatIncomingHandle(1, 3)).toBe("1 new order");
  });

  it("falls back to the open count when nothing is unseen", () => {
    expect(formatIncomingHandle(0, 3)).toBe("3 orders coming in");
  });

  it("uses the singular for a single open order", () => {
    expect(formatIncomingHandle(0, 1)).toBe("1 order coming in");
  });

  it("says the queue is clear when there is nothing at all", () => {
    expect(formatIncomingHandle(0, 0)).toBe("No orders coming in");
  });
});

describe("describeIncomingOrder", () => {
  it("summarizes the customer, total, and item count", () => {
    const line = describeIncomingOrder({
      _id: "x",
      customerName: "Maria",
      total: 250,
      itemCount: 3,
    });
    expect(line).toBe("Maria — ₱250.00 (3 items)");
  });

  it("falls back to defaults when the row is sparse", () => {
    expect(describeIncomingOrder({ _id: "x" })).toBe("Customer — ₱0.00 (0 items)");
  });
});
