/**
 * Recording a stock movement from the merchant's phone.
 *
 * The whole point of this module is that the phone states *what happened* and
 * never *what the number becomes*. The signed delta belongs to the server,
 * which reads the on-hand quantity in the same request that writes the row; a
 * phone that computed it would be working from whatever figure it last
 * refreshed, and the ledger is the source of truth for stock, so a wrong delta
 * is not a stale screen — it is permanent corruption.
 *
 * The preview here exists only so a merchant can see a typo before committing.
 */

import {
  MANUAL_MOVEMENT_REASONS,
  buildMovementPayload,
  describeMovementOutcome,
  isOvercountedWaste,
} from "./inventory-movement";
import type { StockItemView } from "./inventory-stock";

const flour: StockItemView = {
  id: "i1",
  name: "Flour",
  quantity: 12,
  reorderLevel: 5,
  // Already selected by `loadInventoryStock` but dropped when the view was
  // built, because nothing had needed it until stock could be written.
  stockUnitId: "u-kg",
  unitAbbreviation: "kg",
  level: "ok",
};

describe("building the payload the server signs", () => {
  it("sends a magnitude and a reason, never a delta", () => {
    const payload = buildMovementPayload({ reason: "receive", quantity: "100", note: "" }, flour);

    expect(payload.quantity).toBe(100);
    expect(payload.reason).toBe("receive");
    // The signed change is the server's to resolve. Shipping one from here
    // would let a stale screen decide what the shelf holds.
    expect(payload).not.toHaveProperty("quantity_delta");
    expect(payload).not.toHaveProperty("current_qty");
  });

  it("records the movement in the ingredient's own stock unit", () => {
    const payload = buildMovementPayload({ reason: "waste", quantity: "2", note: "" }, flour);

    // No unit picker on the phone: a merchant counting on the floor counts in
    // the unit the shelf is stocked in, and offering another opens a
    // cross-dimension conversion this screen cannot resolve.
    expect(payload.unit_id).toBe("u-kg");
    expect(payload.inventory_item_id).toBe("i1");
  });

  it("keeps a note when one was written and omits it when blank", () => {
    expect(
      buildMovementPayload({ reason: "waste", quantity: "2", note: "  dropped  " }, flour).note,
    ).toBe("dropped");
    expect(
      buildMovementPayload({ reason: "waste", quantity: "2", note: "   " }, flour).note,
    ).toBeUndefined();
  });

  it("rejects a blank, non-numeric or negative quantity", () => {
    const bad = ["", "   ", "abc", "-4"];
    for (const quantity of bad) {
      expect(() => buildMovementPayload({ reason: "receive", quantity, note: "" }, flour)).toThrow();
    }
  });

  it("rejects zero for a delivery but accepts it for a count", () => {
    // Receiving nothing is a slip. Counting zero is the most important count a
    // merchant can record — it says the shelf is empty.
    expect(() =>
      buildMovementPayload({ reason: "receive", quantity: "0", note: "" }, flour),
    ).toThrow();
    expect(
      buildMovementPayload({ reason: "stocktake", quantity: "0", note: "" }, flour).quantity,
    ).toBe(0);
  });

  it("offers exactly the three movements a merchant makes by hand", () => {
    // `sale` and `void` belong to the order path; a merchant recording either
    // by hand would double-count against the order that already moved stock.
    expect([...MANUAL_MOVEMENT_REASONS]).toEqual(["receive", "stocktake", "waste"]);
  });
});

describe("showing the merchant what will happen before it does", () => {
  it("adds a delivery to what is on the shelf", () => {
    expect(describeMovementOutcome("receive", "100", flour)).toEqual({
      from: "12 kg",
      to: "112 kg",
    });
  });

  it("takes waste away from it", () => {
    expect(describeMovementOutcome("waste", "2", flour)).toEqual({ from: "12 kg", to: "10 kg" });
  });

  it("replaces the figure outright on a count", () => {
    // A stocktake reports what is physically there; it is not a change.
    expect(describeMovementOutcome("stocktake", "3", flour)).toEqual({
      from: "12 kg",
      to: "3 kg",
    });
  });

  it("shows nothing rather than a guess while the field is unusable", () => {
    expect(describeMovementOutcome("receive", "", flour)).toBeNull();
    expect(describeMovementOutcome("receive", "abc", flour)).toBeNull();
  });
});

describe("wasting more than the shelf holds", () => {
  it("is flagged so a typo is caught before it is written", () => {
    expect(isOvercountedWaste("waste", "50", flour)).toBe(true);
    expect(isOvercountedWaste("waste", "2", flour)).toBe(false);
  });

  it("is a warning and not a block", () => {
    // Stock legitimately goes negative when a sale lands before its delivery is
    // recorded. Refusing the write would leave the merchant unable to record
    // the truth; the payload is still built.
    expect(
      buildMovementPayload({ reason: "waste", quantity: "50", note: "" }, flour).quantity,
    ).toBe(50);
  });

  it("never flags a delivery or a count", () => {
    expect(isOvercountedWaste("receive", "500", flour)).toBe(false);
    expect(isOvercountedWaste("stocktake", "500", flour)).toBe(false);
  });
});
