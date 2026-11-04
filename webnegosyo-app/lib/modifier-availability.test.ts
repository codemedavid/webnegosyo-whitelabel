/**
 * Which modifier options the register may sell.
 *
 * ONE "sold out" switch: an option the merchant switched off, or a
 * simple-stock option at zero, cannot be picked anywhere — the storefront, the
 * register, a scanned cart. A required group with nothing left to pick makes
 * the whole dish unsellable. A recipe-tracked option is an estimate and is
 * judged elsewhere (it warns, never blocks).
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import {
  isOptionAvailable,
  unfillableRequiredGroup,
  type ModifierGroup,
  type ModifierOption,
} from "./modifier-groups";

const option = (over: Partial<ModifierOption>): ModifierOption => ({
  id: "o1",
  name: "Oat milk",
  price_modifier: 20,
  display_order: 0,
  ...over,
});

const group = (over: Partial<ModifierGroup>): ModifierGroup => ({
  id: "g-milk",
  name: "Milk",
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [option({ id: "o-whole", name: "Whole" }), option({ id: "o-oat", name: "Oat" })],
  ...over,
});

describe("isOptionAvailable", () => {
  it("sells an option nobody has switched off", () => {
    expect(isOptionAvailable(option({}))).toBe(true);
  });

  it("refuses an option the merchant switched off", () => {
    expect(isOptionAvailable(option({ is_available: false }))).toBe(false);
  });

  it("refuses a simple-stock option at zero, and sells it while some is left", () => {
    expect(isOptionAvailable(option({ stock_mode: "simple", stock_qty: 0 }))).toBe(false);
    expect(isOptionAvailable(option({ stock_mode: "simple" }))).toBe(false);
    expect(isOptionAvailable(option({ stock_mode: "simple", stock_qty: 3 }))).toBe(true);
  });

  it("leaves a recipe-tracked option to the stock estimate", () => {
    expect(isOptionAvailable(option({ stock_mode: "recipe", stock_qty: 0 }))).toBe(true);
  });
});

describe("unfillableRequiredGroup", () => {
  it("is null when every required group can still be filled", () => {
    expect(unfillableRequiredGroup([group({})])).toBeNull();
  });

  it("names the required group whose every choice is sold out", () => {
    const milk = group({
      options: [
        option({ id: "o-whole", is_available: false }),
        option({ id: "o-oat", stock_mode: "simple", stock_qty: 0 }),
      ],
    });
    expect(unfillableRequiredGroup([milk])?.name).toBe("Milk");
  });

  it("ignores an optional group with nothing left", () => {
    const extras = group({ min_select: 0, options: [option({ is_available: false })] });
    expect(unfillableRequiredGroup([extras])).toBeNull();
  });

  it("counts a group needing two picks with only one left as unfillable", () => {
    const sides = group({
      name: "Two sides",
      min_select: 2,
      max_select: 2,
      options: [option({ id: "a" }), option({ id: "b", is_available: false })],
    });
    expect(unfillableRequiredGroup([sides])?.name).toBe("Two sides");
  });
});

/**
 * The web's `isOptionAvailable` is the storefront's rule. Transpiled straight
 * from `src/lib/modifier-groups.ts` and run against the same options, so the
 * register cannot quietly sell a choice the website refuses (or the reverse).
 */
describe("parity with the web's isOptionAvailable", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../src/lib/modifier-groups.ts"), "utf8");
  const match = source.match(/export function isOptionAvailable[\s\S]*?\n}\n/);

  it("finds the web rule", () => {
    expect(match).not.toBeNull();
  });

  const webIsOptionAvailable = (() => {
    if (!match) return () => true;
    const js = ts.transpileModule(match[0], {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    const exportsObject: Record<string, unknown> = {};
    new Function("exports", js)(exportsObject);
    return exportsObject.isOptionAvailable as (o: ModifierOption) => boolean;
  })();

  const cases: Partial<ModifierOption>[] = [
    {},
    { is_available: true },
    { is_available: false },
    { stock_mode: "none" },
    { stock_mode: "simple" },
    { stock_mode: "simple", stock_qty: 0 },
    { stock_mode: "simple", stock_qty: -2 },
    { stock_mode: "simple", stock_qty: 1 },
    { stock_mode: "simple", stock_qty: 5, is_available: false },
    { stock_mode: "recipe", stock_qty: 0 },
    { stock_mode: "recipe", is_available: false },
  ];

  it.each(cases.map((c) => [JSON.stringify(c), c]))("agrees on %s", (_label, over) => {
    const subject = option(over as Partial<ModifierOption>);
    expect(isOptionAvailable(subject)).toBe(webIsOptionAvailable(subject));
  });
});
