/**
 * Guardrail for how the order screen reads a failed ledger query.
 *
 * Jest here only runs pure roots, so — as with the other mount guardrails in
 * this directory — this asserts on the source. What it locks down is the one
 * thing a unit test of `order-ledger` cannot see: that the screen actually
 * routes the query error through the shared rule instead of treating any error
 * at all as "the bill is unknown". That inline `!paymentsError` was what made
 * every store on an older deployment unable to edit an order.
 */
import { readFileSync } from "fs";
import { join } from "path";

const screen = readFileSync(
  join(__dirname, "..", "app", "(main)", "order", "[orderId].tsx"),
  "utf8",
);

describe("order detail screen ledger wiring", () => {
  it("classifies the ledger error through the shared rule", () => {
    expect(screen).toMatch(/resolveLedgerState/);
  });

  it("gates the edit on whether the bill is knowable, not on any error", () => {
    expect(screen).toMatch(/isLedgerSafeToEdit/);
    expect(screen).not.toMatch(/if \(paymentsError\)/);
  });

  it("passes the ledger state to the collect gate rather than a bare boolean", () => {
    expect(screen).toMatch(/ledger:\s*ledgerState/);
    expect(screen).not.toMatch(/isLedgerAvailable:\s*!paymentsError/);
  });
});
