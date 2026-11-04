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
 * The words "sold out" belong to the merchant's switch, never to an estimate.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import {
  demandFromCartLines,
  findStockShortfalls,
  parseOptionCeilings,
  resolveAddStockWarning,
  resolvePosStockWarning,
  saleStockDemand,
  type PosStockCeilings,
  type StockDemandLine,
} from "./pos-stock-warning";
import type { PosCartLine, PosCartSelection } from "./pos-cart";
import { buildPosStockItems } from "./pos-stock";

const selection = (optionId: string, optionName: string): PosCartSelection => ({
  groupId: "g-milk",
  groupName: "Milk",
  optionId,
  optionName,
  priceModifier: 0,
});

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

const ceilings = (
  dishes: Record<string, number>,
  options: Record<string, Record<string, number>> = {},
): PosStockCeilings => ({
  dishes: new Map(Object.entries(dishes)),
  options: new Map(
    Object.entries(options).map(([id, byOption]) => [id, new Map(Object.entries(byOption))]),
  ),
});

const warn = (lines: PosCartLine[], known: PosStockCeilings) =>
  resolvePosStockWarning(demandFromCartLines(lines), known);

describe("resolvePosStockWarning", () => {
  it("says nothing when the register knows no ceilings", () => {
    // No inventory, no read, no opinion — the register works as it always did.
    expect(warn([line({})], ceilings({}))).toBeNull();
  });

  it("says nothing when the sale is within what the kitchen can make", () => {
    expect(warn([line({ quantity: 3 })], ceilings({ "m-pizza": 5 }))).toBeNull();
  });

  it("warns when a line outruns the shelf, naming the dish and the number", () => {
    const warning = warn([line({ quantity: 8 })], ceilings({ "m-pizza": 5 }));

    expect(warning).toContain("Margherita");
    expect(warning).toContain("5");
  });

  it("adds up separate lines of the same dish before judging", () => {
    // Two lines of three is six pizzas against a shelf for five; judged apart,
    // each line looks fine and the sale sails through.
    const warning = warn(
      [line({ key: "k1", quantity: 3 }), line({ key: "k2", quantity: 3, note: "no basil" })],
      ceilings({ "m-pizza": 5 }),
    );

    expect(warning).toContain("Margherita");
  });

  it("never warns about a dish with no ceiling", () => {
    expect(
      warn([line({ menuItemId: "m-uncosted", quantity: 99 })], ceilings({ "m-pizza": 5 })),
    ).toBeNull();
  });

  it("reports an empty shelf as a count, never as 'sold out'", () => {
    // "Sold out" is the merchant's switch. An estimate at zero is still a
    // dish the cashier may sell if they can see it on the shelf.
    const warning = warn([line({ quantity: 1 })], ceilings({ "m-pizza": 0 }));

    expect(warning).toMatch(/shows 0/);
    expect(warning).not.toMatch(/sold out/i);
  });

  it("names every dish that is short", () => {
    const warning = warn(
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
    expect(warn([line({ quantity: 0 })], ceilings({ "m-pizza": 0 }))).toBeNull();
  });
});

describe("configuration ceilings (per picked option)", () => {
  const latte = (key: string, quantity: number, milk?: [string, string]) =>
    line({
      key,
      menuItemId: "m-latte",
      name: "Latte",
      quantity,
      selections: milk ? [selection(milk[0], milk[1])] : [],
    });

  it("judges a line by the tightest of the dish and its picked option", () => {
    // Plenty of espresso, only two portions of oat milk.
    const known = ceilings({ "m-latte": 40 }, { "m-latte": { "o-oat": 2 } });

    expect(warn([latte("a", 2, ["o-oat", "Oat"])], known)).toBeNull();
    const warning = warn([latte("a", 3, ["o-oat", "Oat"])], known);
    expect(warning).toContain("Latte (Oat)");
    expect(warning).toContain("2");
  });

  it("does not charge an option's shelf for lines that did not pick it", () => {
    const known = ceilings({ "m-latte": 40 }, { "m-latte": { "o-oat": 1 } });

    expect(warn([latte("a", 5), latte("b", 1, ["o-oat", "Oat"])], known)).toBeNull();
  });

  it("adds up every line that picked the same option", () => {
    const known = ceilings({}, { "m-latte": { "o-oat": 2 } });
    const shortfalls = findStockShortfalls(
      demandFromCartLines([latte("a", 1, ["o-oat", "Oat"]), latte("b", 2, ["o-oat", "Oat"])]),
      known,
    );

    expect(shortfalls).toEqual([
      expect.objectContaining({ menuItemId: "m-latte", optionName: "Oat", producible: 2, wanted: 3 }),
    ]);
  });

  it("reports one shortfall per dish — the tightest", () => {
    const known = ceilings({ "m-latte": 3 }, { "m-latte": { "o-oat": 0 } });
    const shortfalls = findStockShortfalls(demandFromCartLines([latte("a", 4, ["o-oat", "Oat"])]), known);

    expect(shortfalls).toHaveLength(1);
    expect(shortfalls[0]).toEqual(expect.objectContaining({ optionName: "Oat", producible: 0 }));
  });
});

describe("saleStockDemand under an order edit", () => {
  const pizza = (quantity: number) => line({ quantity });

  it("is the whole cart on a counter sale", () => {
    expect(saleStockDemand([pizza(3)], null)).toEqual([
      expect.objectContaining({ menuItemId: "m-pizza", quantity: 3 }),
    ]);
  });

  it("judges only what a revise ADDS — the placed sale was already taken off the shelf", () => {
    // Two pizzas were placed and deducted; the shelf now reads 0. Re-saving
    // the same two must not cry "short", and a third is the only new demand.
    const context = {
      mode: "revise" as const,
      originalStockItems: buildPosStockItems([pizza(2)]),
    };
    const known = ceilings({ "m-pizza": 0 });

    expect(resolvePosStockWarning(saleStockDemand([pizza(2)], context), known)).toBeNull();
    expect(saleStockDemand([pizza(3)], context)).toEqual([
      expect.objectContaining({ menuItemId: "m-pizza", name: "Margherita", quantity: 1 }),
    ]);
  });

  it("asks nothing of the shelf when a revise only removes", () => {
    const context = { mode: "revise" as const, originalStockItems: buildPosStockItems([pizza(4)]) };
    expect(saleStockDemand([pizza(1)], context)).toEqual([]);
  });

  it("is the new round when appending — the parked lines stay out of it", () => {
    const context = { mode: "append" as const, originalStockItems: buildPosStockItems([pizza(5)]) };
    expect(saleStockDemand([pizza(1)], context)).toEqual([
      expect.objectContaining({ quantity: 1 }),
    ]);
  });
});

describe("resolveAddStockWarning", () => {
  const added = (quantity: number): StockDemandLine => ({
    menuItemId: "m-pizza",
    name: "Margherita",
    quantity,
    options: [],
  });

  it("is silent when the new line still fits", () => {
    expect(resolveAddStockWarning([], added(2), ceilings({ "m-pizza": 2 }))).toBeNull();
  });

  it("speaks when the new line takes the dish past its estimate, counting what is already in the sale", () => {
    const inSale = demandFromCartLines([line({ quantity: 2 })]);
    const warning = resolveAddStockWarning(inSale, added(1), ceilings({ "m-pizza": 2 }));

    expect(warning).toContain("Margherita");
    expect(warning).toContain("2");
  });

  it("only speaks about the dish being added", () => {
    const inSale = demandFromCartLines([line({ menuItemId: "m-calzone", name: "Calzone", quantity: 9 })]);
    expect(
      resolveAddStockWarning(inSale, added(1), ceilings({ "m-pizza": 5, "m-calzone": 0 })),
    ).toBeNull();
  });

  it("never speaks without ceilings — an offline register keeps selling", () => {
    expect(resolveAddStockWarning([], added(50), ceilings({}))).toBeNull();
  });
});

/**
 * The web decides the same numbers for the storefront (`option-availability.ts`).
 * Transpiled straight from its source and run beside this module, so a diner
 * and a cashier looking at the same configuration are judged alike.
 */
describe("parity with the web's option-availability", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/lib/inventory/option-availability.ts"),
    "utf8",
  );
  const web = (() => {
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    const exportsObject: Record<string, unknown> = {};
    new Function("exports", "require", js)(exportsObject, () => ({}));
    return exportsObject as {
      configurationCeiling: (
        dish: number | null,
        options: ReadonlyMap<string, number> | undefined,
        selected: readonly string[],
      ) => number | null;
      parseOptionCeilings: (raw: unknown) => Map<string, Map<string, number>>;
    };
  })();

  const dishCases: (number | undefined)[] = [undefined, 0, 1, 3, 10];
  const optionCases: Record<string, number>[] = [{}, { "o-oat": 0 }, { "o-oat": 2 }, { "o-oat": 5, "o-shot": 1 }];
  const pickCases: string[][] = [[], ["o-oat"], ["o-shot"], ["o-oat", "o-shot"], ["o-oat", "o-oat"]];
  const quantities = [1, 2, 4];

  const grid = dishCases.flatMap((dish) =>
    optionCases.flatMap((options) =>
      pickCases.flatMap((picks) => quantities.map((quantity) => ({ dish, options, picks, quantity }))),
    ),
  );

  it.each(grid.map((c) => [JSON.stringify(c), c]))("is short exactly when the web's ceiling is exceeded: %s", (_label, c) => {
    const { dish, options, picks, quantity } = c as (typeof grid)[number];
    const known = ceilings(dish === undefined ? {} : { "m-latte": dish }, { "m-latte": options });
    const demand: StockDemandLine[] = [
      {
        menuItemId: "m-latte",
        name: "Latte",
        quantity,
        options: [...new Set(picks)].map((id) => ({ id, name: id })),
      },
    ];

    const webCeiling = web.configurationCeiling(dish ?? null, new Map(Object.entries(options)), picks);
    const isWebShort = webCeiling !== null && quantity > webCeiling;
    expect(findStockShortfalls(demand, known).length > 0).toBe(isWebShort);
  });

  it.each([
    [null],
    ["nope"],
    [{ m1: { o1: 2, o2: "x", o3: Number.NaN } }],
    [{ m1: null, m2: { o9: 0 } }],
    [{ m1: [1, 2] }],
  ])("parses optionCeilings like the web: %j", (raw) => {
    expect(parseOptionCeilings(raw)).toEqual(web.parseOptionCeilings(raw));
  });
});
