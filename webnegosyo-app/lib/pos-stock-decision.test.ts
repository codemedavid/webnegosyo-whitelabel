/**
 * What the register asks when a sale wants more than the stock count covers:
 * which buttons, which words, and what "Sell N" does to the cart.
 */

import {
  canSellPastStock,
  clampLinesToStock,
  decideAddStock,
  decideChargeStock,
  parsePosStockPolicy,
  type StockDecisionContext,
} from "./pos-stock-decision";
import type { StockShortfall } from "./pos-stock-warning";
import type { PosCartLine } from "./pos-cart";

const short = (overrides: Partial<StockShortfall> = {}): StockShortfall => ({
  menuItemId: "m-latte",
  dishName: "Iced Latte",
  optionName: null,
  optionId: null,
  producible: 5,
  wanted: 7,
  ...overrides,
});

const WARN: StockDecisionContext = { policy: "warn", isOnline: true, canSellShort: false };
const BLOCK_CASHIER: StockDecisionContext = { policy: "block", isOnline: true, canSellShort: false };
const BLOCK_MANAGER: StockDecisionContext = { policy: "block", isOnline: true, canSellShort: true };
const BLOCK_OFFLINE: StockDecisionContext = { policy: "block", isOnline: false, canSellShort: false };

const line = (key: string, menuItemId: string, quantity: number, optionIds: string[] = []): PosCartLine => ({
  key,
  menuItemId,
  name: menuItemId,
  listBasePrice: 100,
  basePrice: 100,
  quantity,
  selections: optionIds.map((optionId) => ({
    groupId: "g",
    groupName: "Milk",
    optionId,
    optionName: optionId,
    priceModifier: 0,
  })),
  unitPrice: 100,
  subtotal: 100 * quantity,
} as unknown as PosCartLine);

describe("parsePosStockPolicy", () => {
  it("reads block only when the server says exactly block", () => {
    expect(parsePosStockPolicy("block")).toBe("block");
    expect(parsePosStockPolicy("warn")).toBe("warn");
  });

  it.each([undefined, null, "", "BLOCK", "refuse", 1, {}])("falls back to warn for %p (older server)", (raw) => {
    expect(parsePosStockPolicy(raw)).toBe("warn");
  });
});

describe("canSellPastStock", () => {
  it("lets the owner and inventory holders sell past the count", () => {
    expect(canSellPastStock({ role: "admin", isOwner: true, permissions: [] })).toBe(true);
    expect(canSellPastStock({ role: "admin", isOwner: false, permissions: ["pos", "inventory"] })).toBe(true);
  });

  it("does not let a plain cashier", () => {
    expect(canSellPastStock({ role: "admin", isOwner: false, permissions: ["pos"] })).toBe(false);
  });
});

describe("decideAddStock", () => {
  it("proceeds when nothing is short", () => {
    expect(decideAddStock({ shortfall: null, addedQuantity: 3 }, WARN)).toEqual({ kind: "proceed" });
  });

  it("asks 'Only 5 left' with Sell 5, Sell anyway, for 7 against 5", () => {
    const decision = decideAddStock({ shortfall: short(), addedQuantity: 7 }, WARN);
    expect(decision.kind).toBe("ask");
    if (decision.kind !== "ask") return;
    const { question } = decision;
    expect(question.title).toBe("Only 5 left");
    expect(question.body).toBe("You're adding 7 × Iced Latte. Stock covers 5.");
    expect(question.sellWithin).toEqual({ label: "Sell 5", units: 5 });
    expect(question.sellAnyway).toEqual({ mode: "proceed", label: "Sell anyway" });
    expect(question.managerNote).toBeNull();
    expect(question.offlineNote).toBeNull();
  });

  it("counts what the sale already holds: 2 in the cart, adding 7, stock 5 → Sell 3", () => {
    const decision = decideAddStock({ shortfall: short({ wanted: 9 }), addedQuantity: 7 }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.body).toBe("You're adding 7 × Iced Latte (2 already in this sale). Stock covers 5.");
    expect(decision.question.sellWithin).toEqual({ label: "Sell 3", units: 3 });
  });

  it("hides Sell N when the stock is 0", () => {
    const decision = decideAddStock({ shortfall: short({ producible: 0, wanted: 1 }), addedQuantity: 1 }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.title).toBe("None left");
    expect(decision.question.sellWithin).toBeNull();
  });

  it("hides Sell N when the cart already holds everything the stock covers", () => {
    const decision = decideAddStock({ shortfall: short({ wanted: 6 }), addedQuantity: 1 }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellWithin).toBeNull();
  });

  it("treats a negative count as 0", () => {
    const decision = decideAddStock({ shortfall: short({ producible: -3, wanted: 2 }), addedQuantity: 2 }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.title).toBe("None left");
    expect(decision.question.body).toBe("You're adding 2 × Iced Latte. Stock covers 0.");
  });

  it("names the option when the option's shelf is the short one", () => {
    const decision = decideAddStock(
      { shortfall: short({ optionName: "Oat", optionId: "o-oat", producible: 2, wanted: 3 }), addedQuantity: 3 },
      WARN,
    );
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.body).toBe("You're adding 3 × Iced Latte (Oat). Stock covers 2.");
  });

  it("block policy: a cashier needs a manager to sell anyway", () => {
    const decision = decideAddStock({ shortfall: short(), addedQuantity: 7 }, BLOCK_CASHIER);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellAnyway.mode).toBe("needs_manager");
    expect(decision.question.managerNote).toMatch(/manager/i);
    // Selling what is in stock never needs anyone.
    expect(decision.question.sellWithin).toEqual({ label: "Sell 5", units: 5 });
  });

  it("block policy: a signed-in manager sells anyway directly", () => {
    const decision = decideAddStock({ shortfall: short(), addedQuantity: 7 }, BLOCK_MANAGER);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellAnyway.mode).toBe("proceed");
    expect(decision.question.managerNote).toBeNull();
  });

  it("block policy offline: never blocks, says the count may be old", () => {
    const decision = decideAddStock({ shortfall: short(), addedQuantity: 7 }, BLOCK_OFFLINE);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellAnyway.mode).toBe("proceed");
    expect(decision.question.managerNote).toBeNull();
    expect(decision.question.offlineNote).toMatch(/offline/i);
  });

  it("ignores a shortfall that is not one (defensive)", () => {
    expect(decideAddStock({ shortfall: short({ wanted: 5 }), addedQuantity: 1 }, WARN)).toEqual({ kind: "proceed" });
  });
});

describe("decideChargeStock", () => {
  it("proceeds with no shortfalls", () => {
    expect(decideChargeStock({ shortfalls: [], canClamp: true }, BLOCK_CASHIER)).toEqual({ kind: "proceed" });
  });

  it("one shortfall reads like the add-time question", () => {
    const decision = decideChargeStock({ shortfalls: [short()], canClamp: true }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.title).toBe("Only 5 left");
    expect(decision.question.body).toBe("This sale has 7 × Iced Latte. Stock covers 5.");
    expect(decision.question.sellWithin).toEqual({ label: "Sell 5", units: 5 });
    expect(decision.question.lines).toHaveLength(1);
  });

  it("lists every shortfall and offers to sell what is in stock", () => {
    const decision = decideChargeStock(
      {
        shortfalls: [short(), short({ menuItemId: "m-cake", dishName: "Cake", producible: 0, wanted: 2 })],
        canClamp: true,
      },
      WARN,
    );
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.title).toBe("Not enough stock for 2 items");
    expect(decision.question.lines).toEqual([
      "Iced Latte: 7 in this sale, stock covers 5",
      "Cake: 2 in this sale, stock covers 0",
    ]);
    expect(decision.question.sellWithin).toEqual({ label: "Sell what's in stock", units: null });
  });

  it("hides the clamp when every short dish is at 0", () => {
    const decision = decideChargeStock(
      { shortfalls: [short({ producible: 0 }), short({ menuItemId: "m-cake", producible: 0 })], canClamp: true },
      WARN,
    );
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellWithin).toBeNull();
  });

  it("hides the clamp when the cart cannot be clamped (a revised order)", () => {
    const decision = decideChargeStock({ shortfalls: [short()], canClamp: false }, WARN);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellWithin).toBeNull();
  });

  it("block policy applies at Charge too", () => {
    const decision = decideChargeStock({ shortfalls: [short()], canClamp: true }, BLOCK_CASHIER);
    if (decision.kind !== "ask") throw new Error("expected a question");
    expect(decision.question.sellAnyway.mode).toBe("needs_manager");
  });
});

describe("clampLinesToStock", () => {
  it("cuts one line of 7 to 5", () => {
    expect(clampLinesToStock([line("a", "m-latte", 7)], [short()])).toEqual([{ key: "a", quantity: 5 }]);
  });

  it("takes from the newest line first and removes lines that reach 0", () => {
    const lines = [line("a", "m-latte", 4), line("b", "m-latte", 3)];
    // 7 wanted, 3 producible → 4 to take: b loses 3 (removed), a loses 1.
    expect(clampLinesToStock(lines, [short({ producible: 3 })])).toEqual([
      { key: "b", quantity: 0 },
      { key: "a", quantity: 3 },
    ]);
  });

  it("an option shortfall only touches lines that picked that option", () => {
    const lines = [line("plain", "m-latte", 2), line("oat", "m-latte", 3, ["o-oat"])];
    const shortfall = short({ optionName: "Oat", optionId: "o-oat", producible: 1, wanted: 3 });
    expect(clampLinesToStock(lines, [shortfall])).toEqual([{ key: "oat", quantity: 1 }]);
  });

  it("removes a dish whose stock is 0", () => {
    expect(clampLinesToStock([line("a", "m-cake", 2)], [short({ menuItemId: "m-cake", producible: 0, wanted: 2 })])).toEqual([
      { key: "a", quantity: 0 },
    ]);
  });

  it("leaves untouched dishes alone and returns nothing when nothing is short", () => {
    expect(clampLinesToStock([line("a", "m-tea", 9)], [])).toEqual([]);
    expect(clampLinesToStock([line("a", "m-tea", 9)], [short()])).toEqual([]);
  });

  it("applies several shortfalls on the same line cumulatively", () => {
    const lines = [line("oat", "m-latte", 7, ["o-oat"])];
    const shortfalls = [short({ producible: 5 }), short({ optionId: "o-oat", optionName: "Oat", producible: 4 })];
    expect(clampLinesToStock(lines, shortfalls)).toEqual([{ key: "oat", quantity: 4 }]);
  });
});
