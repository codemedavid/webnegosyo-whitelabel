/**
 * What staff are allowed to do with a scanned pickup ticket.
 *
 * This is the decision that stands between a customer and someone else's
 * order, so each outcome is explicit rather than a boolean. The rule set is
 * deliberately permissive in one direction only: an order that is not yet
 * `ready` can still be handed over (kitchens run ahead of their own status
 * updates), but it warns first. Everything else that is wrong blocks.
 */

import { evaluatePickupTicket } from "./guards";

const order = {
  status: "ready",
  customerName: "Ana Cruz",
  total: 350,
  items: [{ name: "Latte", quantity: 2 }],
};

describe("evaluatePickupTicket", () => {
  it("allows confirming a ready pickup order", () => {
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order,
    });

    expect(result.decision).toBe("confirm");
    expect(result.warning).toBeNull();
  });

  it("blocks a ticket from a different store", () => {
    // A superadmin hopping between tenants, or a stale code from another
    // branch of the same chain — either way this order is not ours to release.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-other",
      sessionTenantId: "tenant-abc",
      order,
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("wrong_tenant");
  });

  it("blocks a cancelled order", () => {
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "cancelled" },
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("cancelled");
  });

  it("reports an already-collected order as done, not as an error", () => {
    // Double scans are routine — the customer re-shows the code, or staff
    // scan twice. This must read as "already handed over", not as a failure.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "delivered" },
    });

    expect(result.decision).toBe("already_collected");
  });

  it("allows confirming an order that is still being prepared, with a warning", () => {
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "preparing" },
    });

    expect(result.decision).toBe("confirm");
    expect(result.warning).toBe("not_ready");
  });

  it("warns on a pending order rather than blocking it", () => {
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "pending" },
    });

    expect(result.decision).toBe("confirm");
    expect(result.warning).toBe("not_ready");
  });

  it("checks the store before the status", () => {
    // A cancelled order from another store must report the tenant mismatch,
    // so staff are never told anything about an order they cannot see.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-other",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "cancelled" },
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("wrong_tenant");
  });

  it("blocks a ticket when the store has turned scan-to-collect off", () => {
    // The code was printed while the feature was on and still decodes. The
    // switch is only real if a genuine, in-date ticket stops working.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, scanEnabled: false },
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("scan_disabled");
  });

  it("treats an absent scan setting as enabled", () => {
    // An older web deploy omits the field entirely. Absence is not a refusal —
    // it must keep behaving exactly as it does today.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, scanEnabled: undefined },
    });

    expect(result.decision).toBe("confirm");
  });

  it("checks the store before the scan setting", () => {
    // Same rule as the status check: a foreign ticket reveals nothing about
    // the store that issued it, not even whether that store still scans.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-other",
      sessionTenantId: "tenant-abc",
      order: { ...order, scanEnabled: false },
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("wrong_tenant");
  });

  it("reports the disabled store rather than the order's own state", () => {
    // scan_disabled is a store-level refusal, like the tenant check: once the
    // store is not scanning, nothing about the ticket's status is relevant.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: "tenant-abc",
      order: { ...order, status: "delivered", scanEnabled: false },
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("scan_disabled");
  });

  it("blocks when the session has no store in scope", () => {
    // A superadmin who has not entered a store cannot release anyone's order.
    const result = evaluatePickupTicket({
      scannedTenantId: "tenant-abc",
      sessionTenantId: null,
      order,
    });

    expect(result.decision).toBe("block");
    if (result.decision !== "block") return;
    expect(result.reason).toBe("wrong_tenant");
  });
});
