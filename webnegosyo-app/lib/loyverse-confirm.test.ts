/**
 * Confirming an order must reach Loyverse from EVERY surface that can confirm
 * one — the order detail screen, the orders list, and the register drawer — not
 * just the one that happens to hold the line items.
 */
const notifyLoyverseOrderConfirmed = jest.fn(async () => {});
jest.mock("./loyverse-notify", () => ({
  __esModule: true,
  notifyLoyverseOrderConfirmed: (...args: unknown[]) =>
    notifyLoyverseOrderConfirmed(...(args as [])),
}));

import { pushConfirmedOrderToLoyverse } from "./loyverse-confirm";
import { useAuthStore } from "../stores/auth-store";

describe("pushConfirmedOrderToLoyverse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ tenantId: "tenant-1" });
  });

  it("names the order and lets the server resolve its lines", async () => {
    await pushConfirmedOrderToLoyverse("order-1");

    expect(notifyLoyverseOrderConfirmed).toHaveBeenCalledWith("tenant-1", {
      orderId: "order-1",
    });
  });

  it("passes caller-supplied lines through when the screen already holds them", async () => {
    // The detail screen is looking at the dishes; making it pay for a second
    // server-side read would be latency on the confirm tap for no new data.
    const items = [
      {
        menu_item_id: "mi-1",
        menu_item_name: "Americano",
        addons: [],
        quantity: 1,
        price: 120,
        subtotal: 120,
      },
    ];

    await pushConfirmedOrderToLoyverse("order-1", items);

    expect(notifyLoyverseOrderConfirmed).toHaveBeenCalledWith("tenant-1", {
      orderId: "order-1",
      items,
    });
  });

  it("does nothing when no tenant is resolved, rather than pushing to nowhere", async () => {
    useAuthStore.setState({ tenantId: null });

    await pushConfirmedOrderToLoyverse("order-1");

    expect(notifyLoyverseOrderConfirmed).not.toHaveBeenCalled();
  });

  it("never throws, because the order is already confirmed when this runs", async () => {
    notifyLoyverseOrderConfirmed.mockRejectedValue(new Error("offline"));

    await expect(pushConfirmedOrderToLoyverse("order-1")).resolves.toBeUndefined();
  });
});
