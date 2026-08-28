/**
 * The register's stock check — a WARNING, deliberately never a refusal.
 *
 * The online checkout refuses a cart the kitchen cannot fill, because nobody is
 * standing there and the customer can fix it themselves. The register is the
 * opposite situation in every respect: a cashier is facing a paying customer,
 * can see the shelf with their own eyes, and knows things the ledger does not —
 * a delivery that arrived and has not been keyed in, a stocktake nobody ran.
 * Refusing that sale on a number the platform admits is best-effort would turn
 * a software guess into a lost transaction and a queue.
 *
 * So the register is TOLD, and decides. That divergence is the whole design.
 */

import { resolvePosStockWarning } from "./pos-stock-warning";
import type { PosCartLine } from "./pos-cart";

const line = (over: Partial<PosCartLine>): PosCartLine =>
  ({
    key: "k1",
    menuItemId: "m-pizza",
    name: "Margherita",
    basePrice: 200,
    quantity: 1,
    selections: [],
    unitPrice: 200,
    subtotal: 200,
    ...over,
  }) as PosCartLine;

const ceilings = (entries: Record<string, number>) =>
  new Map(Object.entries(entries));

describe("resolvePosStockWarning", () => {
  it("says nothing when the register knows no ceilings", () => {
    // No inventory, no read, no opinion — the register works as it always did.
    expect(resolvePosStockWarning([line({})], new Map())).toBeNull();
  });

  it("says nothing when the sale is within what the kitchen can make", () => {
    expect(
      resolvePosStockWarning([line({ quantity: 3 })], ceilings({ "m-pizza": 5 })),
    ).toBeNull();
  });

  it("warns when a line outruns the shelf, naming the dish and the number", () => {
    const warning = resolvePosStockWarning(
      [line({ quantity: 8 })],
      ceilings({ "m-pizza": 5 }),
    );

    expect(warning).toContain("Margherita");
    expect(warning).toContain("5");
  });

  it("adds up separate lines of the same dish before judging", () => {
    // Two lines of three is six pizzas against a shelf for five; judged apart,
    // each line looks fine and the sale sails through.
    const warning = resolvePosStockWarning(
      [
        line({ key: "k1", quantity: 3 }),
        line({ key: "k2", quantity: 3, note: "no basil" }),
      ],
      ceilings({ "m-pizza": 5 }),
    );

    expect(warning).toContain("Margherita");
  });

  it("never warns about a dish with no ceiling", () => {
    expect(
      resolvePosStockWarning(
        [line({ menuItemId: "m-uncosted", quantity: 99 })],
        ceilings({ "m-pizza": 5 }),
      ),
    ).toBeNull();
  });

  it("says sold out rather than reporting a count of zero", () => {
    const warning = resolvePosStockWarning(
      [line({ quantity: 1 })],
      ceilings({ "m-pizza": 0 }),
    );

    expect(warning).toMatch(/sold out/i);
    expect(warning).not.toMatch(/\b0 left|only 0/i);
  });

  it("names every dish that is short", () => {
    const warning = resolvePosStockWarning(
      [
        line({ quantity: 8 }),
        line({ key: "k2", menuItemId: "m-calzone", name: "Calzone", quantity: 4 }),
      ],
      ceilings({ "m-pizza": 5, "m-calzone": 1 }),
    );

    expect(warning).toContain("Margherita");
    expect(warning).toContain("Calzone");
  });

  it("ignores a line ordering nothing", () => {
    expect(
      resolvePosStockWarning([line({ quantity: 0 })], ceilings({ "m-pizza": 0 })),
    ).toBeNull();
  });
});
