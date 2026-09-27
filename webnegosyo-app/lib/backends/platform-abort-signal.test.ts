import { runPlatformQuery } from "./supabase-adapter";
import { withAbortSignal } from "./platform-client";
import { fakePlatformClient } from "./testing/fake-platform-client";

/**
 * A platform read the cache gave up on — replaced by a realtime invalidation,
 * or past its deadline — must stop on the wire, not just stop being awaited.
 * supabase-js only cancels a request whose builder carries the signal, so the
 * signal has to reach EVERY builder a read makes, including each page of a
 * paged read.
 */

const ORDER_ID = "5b1c3a8e-4f6d-4c2b-9a7e-1d2f3a4b5c6d";

function signalsOn(calls: ReturnType<typeof fakePlatformClient>["calls"]) {
  return calls.map((call) =>
    call.ops.filter((op) => op.method === "abortSignal").map((op) => op.args[0])
  );
}

describe("withAbortSignal", () => {
  it("attaches the signal to every select a read builds", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({
      orders: [{ data: [], error: null }],
      order_items: [{ data: [], error: null }],
    });
    const controller = new AbortController();
    const signalled = withAbortSignal(client, controller.signal);

    // Act
    await signalled.from("orders").select("id").eq("tenant_id", "t1");
    await signalled.from("order_items").select("id").eq("order_id", ORDER_ID);

    // Assert
    expect(signalsOn(calls)).toEqual([[controller.signal], [controller.signal]]);
  });
});

describe("runPlatformQuery — cancellation", () => {
  it("carries the caller's signal into the getOrders read", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });
    const controller = new AbortController();

    // Act
    await runPlatformQuery(client, "t1", "orders:getOrders", {}, { kind: "all" }, controller.signal);

    // Assert
    expect(signalsOn(calls)).toEqual([[controller.signal]]);
  });

  it("carries it into the line-item read too", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ order_items: [{ data: [], error: null }] });
    const controller = new AbortController();

    // Act
    await runPlatformQuery(
      client,
      "t1",
      "orders:getAllOrderItems",
      { orderIds: [ORDER_ID] },
      { kind: "all" },
      controller.signal
    );

    // Assert
    expect(signalsOn(calls)).toEqual([[controller.signal]]);
  });

  it("builds exactly the query it always did when no signal is given", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ orders: [{ data: [], error: null }] });

    // Act
    await runPlatformQuery(client, "t1", "orders:getOrders", {});

    // Assert
    expect(signalsOn(calls)).toEqual([[]]);
  });
});
