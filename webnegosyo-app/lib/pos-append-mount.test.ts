/**
 * Guardrails for the append-a-round wiring.
 *
 * Jest here only runs pure-logic roots, so — like the other mount guardrails in
 * this directory — this asserts on the source rather than rendering it.
 *
 * The specific failure it locks out: the tender screen saving `lines`, the
 * REGISTER's cart, on an append. Every unit test in `pos-append-mode.test.ts`
 * would still pass, `editModeTotals` would still show the right bill, and the
 * save would silently replace the table's whole order with the second round
 * alone — the first round deleted off a bill the customer already ate.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("tender screen", () => {
  const screen = read("app", "(main)", "pos-tender.tsx");

  it("saves the whole order, not just what is on the register", () => {
    expect(screen).toMatch(/posCartToOrderItems\(\s*savedItems\s*\)/);
    // The bug this replaces. `lines` is the second round on its own.
    expect(screen).not.toMatch(/posCartToOrderItems\(\s*lines\s*\)/);
  });

  it("derives the saved line-up from the shared rule", () => {
    expect(screen).toMatch(/effectiveEditCart/);
  });

  it("moves stock for the whole order too, so an append does not un-deplete it", () => {
    // Scoped to the revision call on purpose — the counter-sale path a few
    // lines below legitimately depletes against the register's own cart.
    expect(screen).toMatch(/posStockRevision\([^)]*buildPosStockItems\(savedItems\)/);
  });
});

describe("order detail screen", () => {
  const screen = read("app", "(main)", "order", "[orderId].tsx");

  it("offers adding a round through its own gate, not the edit one", () => {
    expect(screen).toMatch(/canEnterAppendMode/);
  });

  it("opens the register empty for an append", () => {
    expect(screen).toMatch(/enterAppendMode/);
  });

  it("still offers an ordinary edit", () => {
    expect(screen).toMatch(/canEnterEditMode/);
    // Referenced rather than called: the two loaders are picked by mode.
    expect(screen).toMatch(/: enterEditMode/);
  });
});

describe("register screen", () => {
  const screen = read("app", "(main)", "pos.tsx");

  it("tells the cashier which of the two they are doing", () => {
    // Both modes show the was/now header; only append should call itself that,
    // or a cashier ringing up a second round reads it as an edit of the first.
    expect(screen).toMatch(/mode === "append"/);
  });
});
