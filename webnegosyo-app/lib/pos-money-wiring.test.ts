/**
 * Guardrail: the register must have ONE answer to "what does this cost".
 *
 * The web side of this feature learned the lesson expensively. A guardrail
 * there has now caught four separate money-bearing surfaces that had each
 * grown their own copy of `total + deliveryFee + serviceCharge` — including a
 * QR payload that asked a delivery customer for less than the order billed.
 * Each was invisible because it kept compiling and kept looking right.
 *
 * The register was never scanned, because that guardrail only reads `src/`.
 * This is the same check for `webnegosyo-app/`, and the discipline it finds is
 * genuinely better: `cartTotals` and `editModeTotals` are the only two places
 * the arithmetic lives. This test exists to keep it that way once discounts
 * make the arithmetic worth duplicating.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const APP_ROOT = join(__dirname, "..");

/** Directories holding register code. `node_modules` is a symlink here. */
const SCANNED_DIRS = ["lib", "app", "components", "stores", "hooks"];

/**
 * The two functions allowed to add money together, and nothing else.
 *
 * `pos-cart.ts` owns the live cart; `pos-edit-mode.ts` owns a placed order
 * being revised. They are separate because an edit re-applies fees that were
 * already charged rather than computing them fresh.
 */
const TOTALS_OWNERS = ["lib/pos-cart.ts", "lib/pos-edit-mode.ts"];

/**
 * Lines that add money up in order to CHECK a total, never to charge one.
 *
 * Exempted by exact text rather than by file, so that editing the line puts it
 * back in front of this test. The receipt's own test pins that it prints
 * `order.total` and not this figure.
 */
const VERIFICATION_ONLY = [
  "const expectedTotal = subtotal + (order.deliveryFee ?? 0) - (discount?.total ?? 0);",
];

/**
 * A money term added to another money term. Deliberately loose: a false
 * positive costs one refactor, a false negative costs a customer the wrong
 * bill.
 */
const INLINE_SUM =
  /\b(subtotal|itemsTotal|total|newTotal)\b\s*\+\s*[^\n;]*\b(serviceCharge|charge|deliveryFee|carriedCharges|discount)\w*\b/i;

function sourceFilesUnder(dir: string): string[] {
  const absolute = join(APP_ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return []; // A directory this app does not have is not a failure.
  }

  return entries.flatMap((entry) => {
    const relative = `${dir}/${entry}`;
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(join(APP_ROOT, relative)).isDirectory()) return sourceFilesUnder(relative);
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) return [];
    return [relative];
  });
}

const SOURCE_FILES = SCANNED_DIRS.flatMap(sourceFilesUnder);

describe("POS money wiring", () => {
  it("scans a plausible number of files", () => {
    // Guards the guard: a broken walk that finds nothing would pass silently
    // and this whole file would be decoration.
    expect(SOURCE_FILES.length).toBeGreaterThan(20);
  });

  it("keeps the totals arithmetic in the two functions that own it", () => {
    const offenders = SOURCE_FILES.filter((file) => TOTALS_OWNERS.includes(file) === false)
      .flatMap((file) =>
        readFileSync(join(APP_ROOT, file), "utf8")
          .split("\n")
          .map((text, index) => ({ file, line: index + 1, text: text.trim() }))
          .filter(({ text }) => INLINE_SUM.test(text)),
      )
      // A comment describing the arithmetic is not the arithmetic.
      .filter(({ text }) => text.startsWith("//") === false && text.startsWith("*") === false)
      .filter(({ text }) => VERIFICATION_ONLY.includes(text) === false);

    expect(offenders).toEqual([]);
  });

  it("routes the placed order's total through cartTotals", () => {
    // `buildPosOrder` writes the amount the customer is actually charged. It
    // must not restate it.
    const source = readFileSync(join(APP_ROOT, "lib/pos-order.ts"), "utf8");

    expect(source).toContain("cartTotals(");
  });

  it("routes the cart store's displayed total through cartTotals", () => {
    const source = readFileSync(join(APP_ROOT, "stores/pos-cart-store.ts"), "utf8");

    expect(source).toContain("cartTotals(");
  });

  it("prints the backend total on the receipt rather than a recomputed one", () => {
    // The receipt derives a subtotal to CHECK the total, and must never print
    // that check in place of what the customer was charged.
    const source = readFileSync(join(APP_ROOT, "lib/receipt-formatter.ts"), "utf8");

    expect(source).toContain('leftRight("TOTAL:", `P${order.total.toFixed(2)}`');
  });
});
