/**
 * Who may edit a placed order, and when.
 *
 * Editing rewrites a real customer's bill, so the gate is deliberately
 * conservative and every refusal carries a reason the screen can show — a
 * greyed-out button with no explanation is how staff end up calling support.
 */

import { canEditOrder, canIssueRefund } from "./order-edit-guards";
import type { StaffPermissionHolder } from "./staff-permissions";

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };

const staffWith = (...permissions: string[]): StaffPermissionHolder => ({
  role: "staff",
  isOwner: false,
  permissions,
});

describe("canEditOrder", () => {
  it("allows an owner to edit a pending order on a supported backend", () => {
    expect(
      canEditOrder({ status: "pending", backend: "platform", user: OWNER }),
    ).toEqual({ allowed: true });
  });

  it("allows editing an order that is already being prepared", () => {
    // The kitchen is mid-ticket but the bill is not final — this is exactly
    // when "make that a large" happens.
    expect(
      canEditOrder({ status: "preparing", backend: "convex", user: OWNER }).allowed,
    ).toBe(true);
  });

  it("refuses to edit a delivered order", () => {
    const gate = canEditOrder({ status: "delivered", backend: "platform", user: OWNER });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/delivered/i);
  });

  it("refuses to edit a cancelled order", () => {
    const gate = canEditOrder({ status: "cancelled", backend: "platform", user: OWNER });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/cancelled/i);
  });

  it("refuses on a backend that cannot accept the revise mutation", () => {
    // Per-tenant Supabase projects have no mutation path at all today.
    const gate = canEditOrder({ status: "pending", backend: "supabase", user: OWNER });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/not supported/i);
  });

  it("refuses staff who lack the order-edit permission", () => {
    const gate = canEditOrder({
      status: "pending",
      backend: "platform",
      user: staffWith("orders", "pos"),
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/permission/i);
  });

  it("allows staff granted the order-edit permission", () => {
    expect(
      canEditOrder({
        status: "pending",
        backend: "platform",
        user: staffWith("orders", "order_edit"),
      }).allowed,
    ).toBe(true);
  });

  it("reports the status refusal before the permission refusal", () => {
    // A delivered order is not editable by anyone, so telling a staff member
    // they lack permission would send them to ask for the wrong thing.
    const gate = canEditOrder({
      status: "delivered",
      backend: "platform",
      user: staffWith("orders"),
    });

    expect(gate.reason).toMatch(/delivered/i);
  });
});

describe("canIssueRefund", () => {
  it("allows an owner", () => {
    expect(canIssueRefund(OWNER)).toEqual({ allowed: true });
  });

  it("refuses staff who may edit but were not granted refund rights", () => {
    // Refunds move money out of the drawer, so they are granted separately
    // from ordinary order editing.
    const gate = canIssueRefund(staffWith("orders", "order_edit"));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/permission/i);
  });

  it("allows staff granted refund rights", () => {
    expect(canIssueRefund(staffWith("order_refund")).allowed).toBe(true);
  });
});
