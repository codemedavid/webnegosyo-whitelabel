/**
 * An order's status decides whether its ingredients are on the shelf:
 *
 * - into `cancelled`  → put them back (`restore`);
 * - out of `cancelled` to any active status → spend again exactly what the
 *   cancellation returned (`redeplete`).
 *
 * The defect this pins: the app restored on cancel but nothing re-spent on an
 * un-cancel, so a cancelled-then-reinstated order sold its dishes for free.
 * The other defect it keeps closed: the order LIST screen once cancelled
 * without restoring at all while the DETAIL screen did.
 */
import { readFileSync } from "fs";
import { join } from "path";

// The real notifier module is kept (for `withStockRetry`); its transport is
// stubbed so nothing reaches expo-constants or the network.
jest.mock("./authorized-post", () => ({ postAuthorized: jest.fn() }));

const restoreMock = jest.fn();
const redepleteMock = jest.fn();
jest.mock("./pos-stock-notify", () => {
  const actual = jest.requireActual("./pos-stock-notify");
  return {
    __esModule: true,
    ...actual,
    notifyOrderStockRestore: restoreMock,
    notifyOrderStockRedeplete: redepleteMock,
  };
});

const getStateMock = jest.fn();
jest.mock("../stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: { getState: getStateMock },
}));

import { stockActionForStatusChange, syncStockForStatusChange } from "./order-cancel-stock";

const noWait = { delaysMs: [] as number[] };

describe("stockActionForStatusChange", () => {
  it.each([
    ["confirmed", "cancelled", "restore"],
    ["pending", "cancelled", "restore"],
    [undefined, "cancelled", "restore"],
    ["cancelled", "confirmed", "redeplete"],
    ["cancelled", "preparing", "redeplete"],
    ["cancelled", "ready", "redeplete"],
    ["cancelled", "delivered", "redeplete"],
    ["cancelled", "pending", "redeplete"],
    ["cancelled", "cancelled", null],
    ["pending", "confirmed", null],
    ["ready", "delivered", null],
    [undefined, "preparing", null],
  ] as const)("%s → %s is %s", (previous, next, expected) => {
    expect(stockActionForStatusChange(previous, next)).toBe(expected);
  });
});

describe("syncStockForStatusChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStateMock.mockReturnValue({ tenantId: "t1" });
    restoreMock.mockResolvedValue("ok");
    redepleteMock.mockResolvedValue("ok");
  });

  it("restores the order's stock when it is cancelled", async () => {
    // Act
    const outcome = await syncStockForStatusChange(
      { orderId: "jh7dm2p8qr3n5x9", previousStatus: "confirmed", newStatus: "cancelled" },
      noWait,
    );

    // Assert
    expect(outcome).toBe("ok");
    expect(restoreMock).toHaveBeenCalledWith("t1", "jh7dm2p8qr3n5x9", "merchant_app");
    expect(redepleteMock).not.toHaveBeenCalled();
  });

  it("re-spends the stock when a cancelled order is reinstated", async () => {
    // Act
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "cancelled", newStatus: "preparing" }, noWait);

    // Assert
    expect(redepleteMock).toHaveBeenCalledWith("t1", "o1", "merchant_app");
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("retries a transient failure and stops on success", async () => {
    // Arrange
    redepleteMock.mockResolvedValueOnce("retry").mockResolvedValueOnce("ok");
    const sleep = jest.fn().mockResolvedValue(undefined);

    // Act
    const outcome = await syncStockForStatusChange(
      { orderId: "o1", previousStatus: "cancelled", newStatus: "confirmed" },
      { delaysMs: [5], sleep },
    );

    // Assert
    expect(outcome).toBe("ok");
    expect(redepleteMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("runs one order's calls strictly in order, even when fired together", async () => {
    // Arrange — the restore is slow; the reinstate is fired before it lands.
    const calls: string[] = [];
    let releaseRestore: () => void = () => {};
    restoreMock.mockImplementation(() => new Promise((resolve) => {
      calls.push("restore:start");
      releaseRestore = () => { calls.push("restore:end"); resolve("ok"); };
    }));
    redepleteMock.mockImplementation(async () => { calls.push("redeplete"); return "ok"; });

    // Act
    const cancel = syncStockForStatusChange({ orderId: "o9", previousStatus: "confirmed", newStatus: "cancelled" }, noWait);
    const reinstate = syncStockForStatusChange({ orderId: "o9", previousStatus: "cancelled", newStatus: "preparing" }, noWait);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["restore:start"]);
    releaseRestore();
    await Promise.all([cancel, reinstate]);

    // Assert
    expect(calls).toEqual(["restore:start", "restore:end", "redeplete"]);
  });

  it("does nothing for an ordinary forward transition", async () => {
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "pending", newStatus: "confirmed" }, noWait);
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "ready", newStatus: "delivered" }, noWait);
    expect(restoreMock).not.toHaveBeenCalled();
    expect(redepleteMock).not.toHaveBeenCalled();
  });

  it("does nothing when no tenant is signed in", async () => {
    getStateMock.mockReturnValue({ tenantId: null });
    await expect(
      syncStockForStatusChange({ orderId: "o1", previousStatus: "confirmed", newStatus: "cancelled" }, noWait),
    ).resolves.toBeNull();
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("acts for the store being impersonated, not the signed-in account's own", async () => {
    getStateMock.mockReturnValue({ tenantId: "own", impersonatedTenantId: "viewed" });
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "confirmed", newStatus: "cancelled" }, noWait);
    expect(restoreMock).toHaveBeenCalledWith("viewed", "o1", "merchant_app");
  });
});

/**
 * Jest here only runs pure-logic roots, so — like the other mount guardrails
 * in this directory — these assert on the screen sources: EVERY screen that
 * changes an order's status runs the shared stock sync, handing it the status
 * the order had before.
 */
describe("status-change wiring", () => {
  const ROOT = join(__dirname, "..");
  const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");

  it.each([
    [["app", "(main)", "orders.tsx"]],
    [["app", "(main)", "order", "[orderId].tsx"]],
    [["app", "(main)", "kitchen.tsx"]],
    [["app", "(main)", "pos-sales.tsx"]],
    [["app", "(main)", "scan.tsx"]],
    [["lib", "offline", "sync-order-edits.ts"]],
  ])("%j syncs stock with the previous status", (segments) => {
    const source = read(...segments);
    expect(source).toMatch(/syncStockForStatusChange\(/);
    expect(source).toMatch(/previousStatus/);
  });
});
