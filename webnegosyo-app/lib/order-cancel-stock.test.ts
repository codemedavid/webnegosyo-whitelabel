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

// The real queue and drain run; only the network notifiers and the device's
// storage are stubbed.
jest.mock("./authorized-post", () => ({ postAuthorizedDetailed: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn() },
}));

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
import { getStockCalls, resetStockCallsForTests } from "./offline/stock-call-queue";
import { drainStockCalls, resetStockDrainForTests } from "./offline/drain-stock-calls";

/** Let the kicked drain (not awaited by the caller) run to the end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  await drainStockCalls({ tenantId: "t1" });
}

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
    resetStockCallsForTests();
    resetStockDrainForTests();
    getStateMock.mockReturnValue({ tenantId: "t1" });
    restoreMock.mockResolvedValue("ok");
    redepleteMock.mockResolvedValue("ok");
  });

  it("queues and sends a restore when the order is cancelled", async () => {
    // Act
    const action = await syncStockForStatusChange({
      orderId: "jh7dm2p8qr3n5x9",
      previousStatus: "confirmed",
      newStatus: "cancelled",
    });
    await settle();

    // Assert
    expect(action).toBe("restore");
    expect(restoreMock).toHaveBeenCalledWith("t1", "jh7dm2p8qr3n5x9", "merchant_app");
    expect(redepleteMock).not.toHaveBeenCalled();
    expect(getStockCalls()).toEqual([]);
  });

  it("queues and sends a re-spend when a cancelled order is reinstated", async () => {
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "cancelled", newStatus: "preparing" });
    await settle();

    expect(redepleteMock).toHaveBeenCalledWith("t1", "o1", "merchant_app");
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("is stored on the device before it is sent, and kept when it does not land", async () => {
    // The defect: a status change's stock call lived ~40s in memory, so a
    // killed app or a long outage lost it for good.
    redepleteMock.mockResolvedValue("retry");

    await syncStockForStatusChange({ orderId: "o1", previousStatus: "cancelled", newStatus: "confirmed" });
    expect(getStockCalls()).toEqual([expect.objectContaining({ orderId: "o1", action: "redeplete", attempts: 0 })]);
    await settle();

    expect(getStockCalls()).toEqual([expect.objectContaining({ orderId: "o1", action: "redeplete", attempts: 1 })]);
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
    await syncStockForStatusChange({ orderId: "o9", previousStatus: "confirmed", newStatus: "cancelled" });
    await syncStockForStatusChange({ orderId: "o9", previousStatus: "cancelled", newStatus: "preparing" });
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["restore:start"]);
    releaseRestore();
    await settle();

    // Assert
    expect(calls).toEqual(["restore:start", "restore:end", "redeplete"]);
  });

  it("does nothing for an ordinary forward transition", async () => {
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "pending", newStatus: "confirmed" });
    await syncStockForStatusChange({ orderId: "o1", previousStatus: "ready", newStatus: "delivered" });
    await settle();
    expect(getStockCalls()).toEqual([]);
    expect(restoreMock).not.toHaveBeenCalled();
    expect(redepleteMock).not.toHaveBeenCalled();
  });

  it("does nothing when no tenant is signed in", async () => {
    getStateMock.mockReturnValue({ tenantId: null });
    await expect(
      syncStockForStatusChange({ orderId: "o1", previousStatus: "confirmed", newStatus: "cancelled" }),
    ).resolves.toBeNull();
    expect(getStockCalls()).toEqual([]);
  });

  it("acts for the store being impersonated, not the signed-in account's own", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    getStateMock.mockReturnValue({ tenantId: "own", impersonatedTenantId: "viewed" });

    await syncStockForStatusChange({ orderId: "o1", previousStatus: "confirmed", newStatus: "cancelled" }, { send });

    expect(send).toHaveBeenCalledWith({
      tenantId: "viewed",
      orderId: "o1",
      action: "restore",
      payload: { source: "merchant_app" },
    });
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
