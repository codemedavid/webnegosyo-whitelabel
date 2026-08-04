/**
 * Telling "the ledger failed to load" apart from "this store has no ledger".
 *
 * Every store runs its own Convex deployment and most of them are several
 * bundles behind the app. A deployment that predates the settlement ledger
 * answers `orders:getOrderPayments` with "Could not find public function" —
 * which the order screen read as a failed fetch and used to refuse the edit
 * ("Its payment history could not be loaded"). That bricked editing on every
 * store that has not been re-pushed, for a bill nobody had ever paid against.
 *
 * The distinction that fixes it: a deployment with no ledger function also has
 * no way to RECORD a payment, so its ledger is not unknown — it is empty, and
 * an empty ledger is safe to edit against. Only a real fetch failure leaves the
 * bill genuinely unknown.
 */

import { resolveLedgerState, isLedgerSafeToEdit } from "./order-ledger";

describe("resolveLedgerState", () => {
  it("reports a ledger that loaded", () => {
    expect(resolveLedgerState(null)).toBe("available");
    expect(resolveLedgerState(undefined)).toBe("available");
  });

  it("reports a deployment that has no ledger at all as absent, not broken", () => {
    const state = resolveLedgerState(
      "Could not find public function for 'orders:getOrderPayments'",
    );

    expect(state).toBe("absent");
  });

  it("reports a genuine fetch failure as unavailable", () => {
    expect(resolveLedgerState("Query timed out. Check that Convex is deployed.")).toBe(
      "unavailable",
    );
    expect(resolveLedgerState("Network request failed")).toBe("unavailable");
  });
});

describe("isLedgerSafeToEdit", () => {
  it("allows an edit when the ledger loaded", () => {
    expect(isLedgerSafeToEdit("available")).toBe(true);
  });

  it("allows an edit on a store whose backend has no ledger", () => {
    // Nothing could have been paid through a deployment that cannot record a
    // payment, so the bill on screen is the whole truth about this order.
    expect(isLedgerSafeToEdit("absent")).toBe(true);
  });

  it("refuses an edit when the ledger exists but could not be read", () => {
    // Here the order may already be settled and the register would re-charge.
    expect(isLedgerSafeToEdit("unavailable")).toBe(false);
  });
});
