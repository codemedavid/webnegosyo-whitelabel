/**
 * Phase 4 — the merchant app's copy of the daily inventory report.
 *
 * The app cannot import from the web app's `src/`, so the pure core is COPIED
 * here. Copies rot: this repo already carries three hand-synced copies of the
 * staff-permission registry, and a report that grades a day differently on the
 * phone than on the web is worse than having no phone report at all — the
 * merchant would have two verdicts about one day and no way to choose.
 *
 * So the guardrail is mechanical rather than a matter of care: every ported
 * module must be textually identical to its web original, ignoring only the
 * import lines (which legitimately differ, `@/lib/inventory/x` here being
 * `./x`). Any divergence in the actual rules fails this test.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { buildDailyInventoryReport } from "./daily-report";
import { judgeVariance } from "./variance-verdict";
import { resolveFoodCostPercent } from "./food-cost";
import { toBusinessDayKey } from "./business-day";
import { MOVEMENT_REASONS } from "./movement-reason";

/** webnegosyo-app/lib/daily-report → repo root. */
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WEB_DIR = join(REPO_ROOT, "src", "lib", "inventory");

/**
 * Strips import statements and trailing whitespace so the comparison is about
 * the RULES, not about how each app resolves a module path.
 */
function logicOf(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*import\s/.test(line))
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

const PORTED_MODULES = [
  "business-day",
  "count-session",
  "daily-report",
  "daily-report-view",
  "food-cost",
  "variance-verdict",
];

describe("ported daily-report modules match the web originals", () => {
  test.each(PORTED_MODULES)("%s.ts has not drifted from src/lib/inventory", (moduleName) => {
    const web = readFileSync(join(WEB_DIR, `${moduleName}.ts`), "utf8");
    const app = readFileSync(join(__dirname, `${moduleName}.ts`), "utf8");

    expect(logicOf(app)).toBe(logicOf(web));
  });
});

describe("the movement reasons the report understands", () => {
  test("covers every reason the web ledger can write", () => {
    // `daily-report.ts` branches on these. The app's own
    // `inventory-movement.ts` lists only the three a merchant enters BY HAND;
    // a report blind to `sale` and `void` would show a day of pure deliveries.
    // Read to the blank line that ends the union, not to the end of the first
    // line. The union was single-line when this was written and later grew to
    // one member per line — at which point the old `[^\n]+` capture matched
    // only `receive` and this guardrail was comparing the app's whole list
    // against a single reason. A parity test that stops reading halfway is
    // worse than none: it reports drift that isn't there and hides the drift
    // that is. `_` is in the character class because `transfer_out` exists.
    const web = readFileSync(join(WEB_DIR, "stock-ledger.ts"), "utf8");
    const declared = web.match(/export type StockMovementReason\s*=([\s\S]*?)\n\s*\n/)?.[1] ?? "";
    const webReasons = [...declared.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])

    expect([...MOVEMENT_REASONS].sort()).toEqual(webReasons.sort());
  });
});

describe("the ported core actually runs", () => {
  // Text parity proves the copies say the same thing; these prove they are
  // wired up and exported, not merely present as files.
  test("reconciles a day", () => {
    const report = buildDailyInventoryReport({
      movements: [
        {
          inventoryItemId: "i1",
          reason: "sale",
          quantityDelta: -5,
          balanceAfter: 95,
          createdAt: "2026-07-29T02:00:00.000Z",
        },
      ],
      ingredients: [{ id: "i1", name: "Beans", unitCost: 2, stockUnitAbbreviation: "g" }],
    });

    expect(report.rows).toHaveLength(1);
    expect(report.totals.cogs).toBe(10);
  });

  test("grades a day", () => {
    expect(
      judgeVariance({ cogs: 1000, shrinkageCost: 10, countedCount: 2, dishesWithRecipe: 4 }).level,
    ).toBe("good");
  });

  test("refuses to grade a day with no recipes", () => {
    expect(
      judgeVariance({ cogs: 0, shrinkageCost: 0, countedCount: 0, dishesWithRecipe: 0 }).level,
    ).toBeNull();
  });

  test("omits the food cost when the takings are unknown", () => {
    expect(resolveFoodCostPercent(300, null)).toBeNull();
  });

  test("uses the Manila business day, so it agrees with the web report", () => {
    // 2026-07-29 23:30 Manila is already the 29th's trade, not the 30th's.
    expect(toBusinessDayKey("2026-07-29T15:30:00.000Z")).toBe("2026-07-29");
  });
});
