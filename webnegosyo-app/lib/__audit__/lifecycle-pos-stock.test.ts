/**
 * AUDIT — merchant-app (POS) stock lifecycle (2026-10-13).
 *
 * Each `BUG` case asserts the correct behaviour and FAILS on main.
 */

const postAuthorizedMock = jest.fn();
jest.mock("../authorized-post", () => ({
  postAuthorizedDetailed: (...args: unknown[]) => postAuthorizedMock(...args),
}));

import type { QueuedSale } from "../offline/order-outbox";
import { resetSyncForTests, syncOutbox } from "../offline/sync-outbox";
import { runPosSaleBookkeeping } from "../offline/pos-sale-bookkeeping";
import { notifyPosStockDepletion } from "../pos-stock-notify";
import { hydratePosCart, type ModifierCatalog } from "../order-edit-cart";
import { buildPosStockItems } from "../pos-stock";

function queuedSale(): QueuedSale {
  return {
    localId: "local-1",
    tenantId: "tenant-1",
    backend: "platform",
    clientOrderId: "pos-local-1",
    createdAt: 1000,
    orderArgs: { clientOrderId: "pos-local-1", total: 10, paymentStatus: "paid" },
    bookkeeping: {
      stockItems: [{ menuItemId: "menu-1", quantity: 2, optionIds: [], addonIds: [] }],
      loyverseLines: [],
      discountLines: [],
      outletId: null,
      total: 10,
      customerName: "",
      customerContact: "",
      customerData: {},
      channel: "Dine-in",
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
  } as unknown as QueuedSale;
}

describe("BUG — offline/write-behind register sale: a failed stock POST is never retried", () => {
  beforeEach(() => {
    resetSyncForTests();
    postAuthorizedMock.mockReset();
  });

  it("does not mark bookkeeping done when the platform refused (or never received) the depletion", async () => {
    // Arrange — the order write succeeds, but the stock POST times out /
    // 5xxs / has no session (the post answers not-ok, never throws).
    postAuthorizedMock.mockResolvedValue({ ok: false, status: null });
    const markBookkeepingDone = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const noop = jest.fn().mockResolvedValue(undefined);

    // Act — the real bookkeeping runner, real stock notifier.
    await syncOutbox({
      tenantId: "tenant-1",
      backend: "platform",
      createOrder: async () => "order-uuid-1",
      updatePaymentStatus: noop,
      bookkeeping: (facts) =>
        runPosSaleBookkeeping(facts, {
          stock: notifyPosStockDepletion,
          loyverse: noop,
          vouchers: noop,
          activity: noop,
          capture: noop,
        } as never),
      listSales: () => [queuedSale()],
      remove,
      recordFailure: noop,
      markWritten: noop,
      markBookkeepingDone,
      rebindEdits: noop,
    });

    // Assert — stock was attempted once…
    expect(postAuthorizedMock).toHaveBeenCalledWith(
      "/api/inventory/order-stock",
      expect.objectContaining({ orderId: "order-uuid-1" }),
    );
    // …and the sale must stay owed so the next sync retries it. Main marks it
    // done and forgets it: the paid sale never depletes (live: ~29 POS orders
    // since 2026-09-28 on gungjeon-unlimited, puesto, cribings, ate-lolet,
    // haro-haro with no claim and no audit row at all).
    expect(markBookkeepingDone).not.toHaveBeenCalled();
  });
});

describe("BUG — editing a web order with an add-on amount restores the wrong stock", () => {
  it("hydrates 'Kimchi ×2' to the real option id with 2 portions", () => {
    // Web checkout stores an add-on amount as `${name} ×${n}` (src/lib/addon-quantity.ts)
    // and depletes n portions via addonQuantities. The register's edit
    // "before" snapshot is rebuilt from these names against the live menu.
    const catalog: ModifierCatalog = {
      "menu-1": [
        {
          id: "grp-sides",
          name: "Sides",
          display_order: 0,
          min_select: 0,
          max_select: null,
          options: [{ id: "opt-kimchi", name: "Kimchi", price_modifier: 0, display_order: 0 }],
        },
      ],
    };

    const { lines } = hydratePosCart(
      [{ menuItemId: "menu-1", menuItemName: "Sidedishes", quantity: 1, subtotal: 10, addons: [{ name: "Kimchi ×2", price: 0 }] }],
      catalog,
    );
    const [stock] = buildPosStockItems(lines);

    // Main: optionIds = ["orphan:Kimchi ×2"] and no portions — removing the
    // line in an edit restores the base recipe only; the 2 kimchi portions
    // stay spent forever.
    expect(stock.addonIds).toContain("opt-kimchi");
    expect((stock as { addonQuantities?: Record<string, number> }).addonQuantities).toEqual({ "opt-kimchi": 2 });
  });
});
