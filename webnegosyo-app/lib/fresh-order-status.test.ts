import { fetchFreshOrderStatus, guardKitchenStatusWrite } from "./fresh-order-status";

/**
 * The kitchen board's copy of an order can be seconds behind. A ticket
 * cancelled at the counter and bumped from a board that had not heard yet was
 * written back to `ready`: the order came back to life with its stock already
 * restored by the cancel, and nothing ever spent it again.
 */
describe("guardKitchenStatusWrite", () => {
  it("refuses to bump or recall an order the server says is cancelled", () => {
    const guard = guardKitchenStatusWrite({ boardStatus: "preparing", freshStatus: "cancelled" });
    expect(guard.allow).toBe(false);
    expect(guard.allow === false && guard.message).toMatch(/cancelled/i);
  });

  it("writes with the server's status as the one the order had before", () => {
    expect(guardKitchenStatusWrite({ boardStatus: "confirmed", freshStatus: "preparing" })).toEqual({
      allow: true,
      previousStatus: "preparing",
    });
  });

  it("falls back to the board's status when the server could not be asked (offline)", () => {
    expect(guardKitchenStatusWrite({ boardStatus: "confirmed", freshStatus: null })).toEqual({
      allow: true,
      previousStatus: "confirmed",
    });
  });
});

describe("fetchFreshOrderStatus", () => {
  it("asks the platform on a platform store", async () => {
    const queryPlatform = jest.fn().mockResolvedValue({ _id: "o1", status: "cancelled" });
    const queryConvex = jest.fn();

    await expect(
      fetchFreshOrderStatus("o1", { route: "platform", queryPlatform, queryConvex }),
    ).resolves.toBe("cancelled");
    expect(queryPlatform).toHaveBeenCalledWith({ orderId: "o1" });
    expect(queryConvex).not.toHaveBeenCalled();
  });

  it("asks Convex on a Convex store", async () => {
    const queryConvex = jest.fn().mockResolvedValue({ status: "ready" });
    await expect(
      fetchFreshOrderStatus("o1", { route: "convex", queryPlatform: jest.fn(), queryConvex }),
    ).resolves.toBe("ready");
  });

  it("answers null — not a guess — when it cannot find out", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("offline"));
    const never = jest.fn(() => new Promise<unknown>(() => undefined));
    const deps = { queryConvex: jest.fn(), timeoutMs: 10 };

    await expect(fetchFreshOrderStatus("o1", { ...deps, route: "platform", queryPlatform: failing })).resolves.toBeNull();
    await expect(fetchFreshOrderStatus("o1", { ...deps, route: "platform", queryPlatform: never })).resolves.toBeNull();
    await expect(
      fetchFreshOrderStatus("o1", { ...deps, route: "platform", queryPlatform: jest.fn().mockResolvedValue(null) }),
    ).resolves.toBeNull();
    await expect(fetchFreshOrderStatus("o1", { ...deps, route: "idle", queryPlatform: jest.fn() })).resolves.toBeNull();
  });

  it("does not ask at all when the device knows it is offline", async () => {
    const queryPlatform = jest.fn();
    await expect(
      fetchFreshOrderStatus("o1", { route: "platform", isOffline: true, queryPlatform, queryConvex: jest.fn() }),
    ).resolves.toBeNull();
    expect(queryPlatform).not.toHaveBeenCalled();
  });
});
