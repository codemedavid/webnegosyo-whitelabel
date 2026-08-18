/**
 * Cancelling an order must put its ingredients back — from EVERY screen that
 * can cancel.
 *
 * The defect: the order LIST screen's cancel path called the Convex status
 * mutation and stopped, while the order DETAIL screen also fired
 * `notifyOrderStockRestore`. Same button label, different ledger outcome —
 * a cancel from the queue left the ingredients spent forever.
 *
 * The shared side-effect lives in `order-cancel-stock.ts` so both screens run
 * the identical fire-and-forget restore, and the guardrails below pin the
 * wiring a unit test of the helper alone cannot see.
 */
import { readFileSync } from "fs";
import { join } from "path";

const restoreMock = jest.fn();
jest.mock("./pos-stock-notify", () => ({
  __esModule: true,
  notifyOrderStockRestore: restoreMock,
}));

const getStateMock = jest.fn();
jest.mock("../stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: { getState: getStateMock },
}));

import { restoreStockForStatusChange } from "./order-cancel-stock";

describe("restoreStockForStatusChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStateMock.mockReturnValue({ tenantId: "t1" });
    restoreMock.mockResolvedValue(undefined);
  });

  it("restores the order's stock when the new status is cancelled", async () => {
    // Act
    await restoreStockForStatusChange("cancelled", "jh7dm2p8qr3n5x9");

    // Assert
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(restoreMock).toHaveBeenCalledWith("t1", "jh7dm2p8qr3n5x9");
  });

  it("does nothing for any non-cancel transition", async () => {
    // Act — every forward transition the queue offers.
    await restoreStockForStatusChange("confirmed", "order-1");
    await restoreStockForStatusChange("preparing", "order-1");
    await restoreStockForStatusChange("delivered", "order-1");

    // Assert
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("does nothing when no tenant is signed in", async () => {
    // Arrange — demo mode / logged-out edge: there is no tenant to bill it to.
    getStateMock.mockReturnValue({ tenantId: null });

    // Act
    await restoreStockForStatusChange("cancelled", "order-1");

    // Assert
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

/**
 * Jest here only runs pure-logic roots, so — like the other mount guardrails
 * in this directory — these assert on the screen sources. What they lock down
 * is the defect itself: BOTH cancel paths must run the shared restore.
 */
describe("cancel wiring", () => {
  const ROOT = join(__dirname, "..");
  const read = (...segments: string[]) =>
    readFileSync(join(ROOT, ...segments), "utf8");

  it("the order LIST screen restores stock on cancel", () => {
    const screen = read("app", "(main)", "orders.tsx");
    expect(screen).toMatch(/restoreStockForStatusChange/);
  });

  it("the order DETAIL screen runs the same shared restore", () => {
    const screen = read("app", "(main)", "order", "[orderId].tsx");
    expect(screen).toMatch(/restoreStockForStatusChange/);
  });
});
