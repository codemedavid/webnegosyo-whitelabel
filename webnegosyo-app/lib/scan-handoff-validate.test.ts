/**
 * Whether staff may accept a scanned cart handoff, and at what prices.
 *
 * The QR is customer-supplied: it names items, quantities, prices and
 * subtotals. Only the catalog is trusted. An item the catalog does not know
 * used to sail through with its QR-supplied price; a quantity of 0, 1.5 or
 * NaN used to reach the order; and a code from another store was accepted
 * into this one. Pure, so each refusal is testable without a camera.
 */

import { evaluateCartHandoff } from "./scan-handoff-validate";
import type { QrOrderItemV1, QrOrderPayloadV1 } from "./qr-order-codec";

const TENANT = "tenant-abc";

function item(overrides: Partial<QrOrderItemV1> = {}): QrOrderItemV1 {
  return {
    menuItemId: "item-1",
    menuItemName: "Latte",
    quantity: 2,
    price: 150,
    subtotal: 300,
    ...overrides,
  };
}

function payload(items: QrOrderItemV1[], tenantId = TENANT): QrOrderPayloadV1 {
  return {
    v: 1,
    cid: "cid-1",
    t: 0,
    tenantId,
    tenantSlug: "abc",
    orderTypeId: "ot-1",
    orderType: "dine_in",
    customerName: "Ana",
    customerContact: "0917",
    customerData: {},
    items,
    total: items.reduce((sum, i) => sum + i.subtotal, 0),
    ck: "deadbeef",
  };
}

const catalog = new Map<string, number>([["item-1", 150], ["item-2", 80]]);

describe("evaluateCartHandoff", () => {
  it("accepts a cart whose items are all in the catalog at matching prices", () => {
    const result = evaluateCartHandoff({
      payload: payload([item(), item({ menuItemId: "item-2", price: 80, subtotal: 80, quantity: 1 })]),
      sessionTenantId: TENANT,
      catalogPrices: catalog,
    });

    expect(result).toEqual({
      ok: true,
      items: [item(), item({ menuItemId: "item-2", price: 80, subtotal: 80, quantity: 1 })],
      total: 380,
      pricesUpdated: false,
    });
  });

  it("re-prices an item from the catalog, preserving the per-unit modifier delta", () => {
    // QR says 140 base + 10 modifier = 150/unit; catalog base is 150.
    const result = evaluateCartHandoff({
      payload: payload([item({ price: 140, subtotal: 300 })]),
      sessionTenantId: TENANT,
      catalogPrices: catalog,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pricesUpdated).toBe(true);
    expect(result.items[0]).toEqual(item({ price: 150, subtotal: 320 }));
    expect(result.total).toBe(320);
  });

  it("blocks a code from another store before looking at the items", () => {
    const result = evaluateCartHandoff({
      payload: payload([item({ menuItemId: "ghost" })], "tenant-other"),
      sessionTenantId: TENANT,
      catalogPrices: catalog,
    });
    expect(result).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("blocks when the session has no store at all", () => {
    const result = evaluateCartHandoff({
      payload: payload([item()]),
      sessionTenantId: null,
      catalogPrices: catalog,
    });
    expect(result).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("rejects an item the catalog does not know instead of keeping its QR price", () => {
    const result = evaluateCartHandoff({
      payload: payload([item(), item({ menuItemId: "ghost", price: 1, subtotal: 1 })]),
      sessionTenantId: TENANT,
      catalogPrices: catalog,
    });
    expect(result).toEqual({ ok: false, reason: "unknown_item" });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects quantity %p",
    (quantity) => {
      const result = evaluateCartHandoff({
        payload: payload([item({ quantity })]),
        sessionTenantId: TENANT,
        catalogPrices: catalog,
      });
      expect(result).toEqual({ ok: false, reason: "bad_quantity" });
    },
  );

  it("rejects a non-finite price or subtotal", () => {
    expect(
      evaluateCartHandoff({
        payload: payload([item({ price: Number.NaN })]),
        sessionTenantId: TENANT,
        catalogPrices: catalog,
      }),
    ).toEqual({ ok: false, reason: "bad_price" });
    expect(
      evaluateCartHandoff({
        payload: payload([item({ subtotal: Number.POSITIVE_INFINITY })]),
        sessionTenantId: TENANT,
        catalogPrices: catalog,
      }),
    ).toEqual({ ok: false, reason: "bad_price" });
  });

  it("rejects an empty cart", () => {
    const result = evaluateCartHandoff({
      payload: payload([]),
      sessionTenantId: TENANT,
      catalogPrices: catalog,
    });
    expect(result).toEqual({ ok: false, reason: "no_items" });
  });
});
