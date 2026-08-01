/**
 * RED for composing a transfer on the phone.
 *
 * The merchant app can currently only RECEIVE a consignment. These are the
 * rules the composing half needs before any of it can be drafted safely, and
 * every one of them exists because getting it wrong moves real stock:
 *
 * - what a branch may put on a van is what THAT BRANCH holds, never the chain
 *   roll-up on `inventory_items.current_qty`;
 * - the refusals must be worded exactly as the server words them, because the
 *   same merchant reads both surfaces about the same box.
 *
 * Pure by necessity as well as by taste: the app's Jest only picks up `lib/`
 * and `theme/`, so anything that has to be tested rather than source-guarded
 * must live here.
 */
import {
  ingredientsAvailableAt,
  overDraftedItemIds,
  canSendFrom,
  parseTransferQuantity,
  describeDraftProblem,
  type SendableIngredient,
} from "./transfer-draft";
import type { StockItemView } from "./inventory-stock";

function shelfItem(overrides: Partial<StockItemView> & { id: string }): StockItemView {
  return {
    name: `Item ${overrides.id}`,
    quantity: 10,
    reorderLevel: 0,
    stockUnitId: "unit-1",
    unitAbbreviation: "kg",
    level: "ok",
    ...overrides,
  };
}

describe("what a branch can put on a van", () => {
  it("offers what the shelf in front of the merchant holds", () => {
    const available = ingredientsAvailableAt([
      shelfItem({ id: "flour", name: "Flour", quantity: 40, unitAbbreviation: "kg" }),
    ]);

    expect(available).toEqual<SendableIngredient[]>([
      { id: "flour", name: "Flour", unitAbbreviation: "kg", onHand: 40 },
    ]);
  });

  it("drops an ingredient the branch holds none of", () => {
    // Deliberately the opposite of `applyBranchStock`, which keeps a zero
    // ingredient listed so a manager can receive their first delivery of it: a
    // shelf with nothing on it is a thing you put stock ON, not take stock OFF.
    const available = ingredientsAvailableAt([
      shelfItem({ id: "flour", quantity: 40 }),
      shelfItem({ id: "sugar", quantity: 0 }),
    ]);

    expect(available.map((item) => item.id)).toEqual(["flour"]);
  });

  it("drops an ingredient the branch is showing negative", () => {
    // Negative means a sale landed before its delivery was recorded. There is
    // still nothing physically there to load onto a van.
    const available = ingredientsAvailableAt([shelfItem({ id: "flour", quantity: -3 })]);

    expect(available).toEqual([]);
  });

  it("treats round-trip dust as nothing", () => {
    // NUMERIC(16,4): anything under a ten-thousandth is not stock.
    const available = ingredientsAvailableAt([shelfItem({ id: "flour", quantity: 0.00001 })]);

    expect(available).toEqual([]);
  });

  it("lists the picker alphabetically rather than worst-first", () => {
    // The shelf sorts trouble to the top, which is exactly backwards for a
    // send picker: a merchant loading a van is looking for what they have
    // plenty of, and hunting a name down a list ordered by scarcity is slower
    // than reading it in the order they already think about ingredients.
    const available = ingredientsAvailableAt([
      shelfItem({ id: "sugar", name: "Sugar", quantity: 2, level: "low" }),
      shelfItem({ id: "flour", name: "Flour", quantity: 90 }),
    ]);

    expect(available.map((item) => item.name)).toEqual(["Flour", "Sugar"]);
  });
});

describe("lines asking for more than the branch holds", () => {
  const shelf = [shelfItem({ id: "flour", quantity: 40 })];

  it("names the line that is too big rather than answering yes or no", () => {
    // Ids, so the sheet can point at the wrong row. "Something in this
    // transfer is too big" makes the merchant re-check every figure they typed.
    expect(overDraftedItemIds([{ inventoryItemId: "flour", quantity: 41 }], shelf)).toEqual([
      "flour",
    ]);
  });

  it("allows sending the whole shelf", () => {
    expect(overDraftedItemIds([{ inventoryItemId: "flour", quantity: 40 }], shelf)).toEqual([]);
  });

  it("counts an ingredient missing from the shelf as over-drafted", () => {
    // No row means zero, never the roll-up — the rule that separates stock
    // from menu overrides.
    expect(overDraftedItemIds([{ inventoryItemId: "sugar", quantity: 1 }], shelf)).toEqual([
      "sugar",
    ]);
  });
});

describe("who may send from where", () => {
  it("lets an owner send from any branch", () => {
    expect(canSendFrom({ kind: "all" }, "north")).toBe(true);
  });

  it("lets an owner send from the unbranched store pool", () => {
    // The pool is a real shelf that a pre-branches tenant's stock sits on.
    expect(canSendFrom({ kind: "all" }, null)).toBe(true);
  });

  it("confines a branch account to its own branch", () => {
    expect(canSendFrom({ kind: "branch", outletId: "north" }, "north")).toBe(true);
    expect(canSendFrom({ kind: "branch", outletId: "north" }, "south")).toBe(false);
  });

  it("refuses a branch account the store pool", () => {
    // A branch may send only its own stock. Mirrors `canSendTransfer`.
    expect(canSendFrom({ kind: "branch", outletId: "north" }, null)).toBe(false);
  });
});

describe("a quantity typed on a phone", () => {
  it("reads a plain number", () => {
    expect(parseTransferQuantity("12.5")).toBe(12.5);
  });

  it("refuses a blank box", () => {
    // Never coerced to zero: a zero-quantity line writes a ledger leg that
    // moves nothing while claiming a transfer happened.
    expect(parseTransferQuantity("")).toBeNull();
    expect(parseTransferQuantity("   ")).toBeNull();
  });

  it("refuses something that is not a number", () => {
    expect(parseTransferQuantity("twelve")).toBeNull();
  });

  it("refuses zero and negatives", () => {
    expect(parseTransferQuantity("0")).toBeNull();
    expect(parseTransferQuantity("-4")).toBeNull();
  });
});

describe("what is wrong with this draft", () => {
  const lines = [{ inventoryItemId: "flour", quantity: 5 }];

  it("passes a well-formed draft", () => {
    expect(
      describeDraftProblem({ fromOutletId: "north", toOutletId: "south", lines }),
    ).toBeNull();
  });

  it("refuses a transfer to the branch it came from, in the server's words", () => {
    expect(
      describeDraftProblem({ fromOutletId: "north", toOutletId: "north", lines }),
    ).toBe("A transfer cannot be sent to the same branch it came from");
  });

  it("refuses an empty transfer, in the server's words", () => {
    expect(
      describeDraftProblem({ fromOutletId: "north", toOutletId: "south", lines: [] }),
    ).toBe("A transfer needs at least one ingredient");
  });

  it("refuses a non-positive line, in the server's words", () => {
    expect(
      describeDraftProblem({
        fromOutletId: "north",
        toOutletId: "south",
        lines: [{ inventoryItemId: "flour", quantity: 0 }],
      }),
    ).toBe("Every line needs a quantity greater than zero");
  });

  it("refuses the same ingredient twice, in the server's words", () => {
    // The transfer schema has a unique index on it, so a second line would be
    // refused after the merchant had typed it — and it makes the receiving
    // count ambiguous, which is worse.
    expect(
      describeDraftProblem({
        fromOutletId: "north",
        toOutletId: "south",
        lines: [
          { inventoryItemId: "flour", quantity: 5 },
          { inventoryItemId: "flour", quantity: 2 },
        ],
      }),
    ).toBe("Each ingredient can appear on a transfer only once");
  });

  it("treats the store pool as a place, not as an absent branch", () => {
    // `null` is the unbranched pool and is a legitimate end of a transfer.
    // Pool-to-pool is still the same shelf twice.
    expect(describeDraftProblem({ fromOutletId: null, toOutletId: "south", lines })).toBeNull();
    expect(describeDraftProblem({ fromOutletId: null, toOutletId: null, lines })).toBe(
      "A transfer cannot be sent to the same branch it came from",
    );
  });
});
