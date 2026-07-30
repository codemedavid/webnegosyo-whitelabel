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

  it("allows editing an order the merchant has confirmed but not started", () => {
    // Confirmed means accepted, not cooked. The bill is still open and no
    // ingredients have been committed, so a correction here costs nothing.
    expect(
      canEditOrder({ status: "confirmed", backend: "convex", user: OWNER }).allowed,
    ).toBe(true);
  });

  /**
   * Editing stops the moment the kitchen starts.
   *
   * This REVERSES the original rule, which allowed edits through `preparing` on
   * the theory that "make that a large" happens mid-ticket. In practice the
   * ticket has already been printed and the food started, so an edit silently
   * desynchronises the bill from what is actually being cooked — and the stock
   * already moved against the original lines.
   */
  it("refuses to edit an order the kitchen has started", () => {
    const gate = canEditOrder({ status: "preparing", backend: "convex", user: OWNER });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/prepar/i);
  });

  it("refuses to edit an order that is ready", () => {
    // `ready` is past `preparing`, so anything blocked there is blocked here.
    const gate = canEditOrder({ status: "ready", backend: "convex", user: OWNER });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBeTruthy();
  });

  it("refuses the owner too — this is a status rule, not a permission one", () => {
    // No one can un-cook food, so there is no role for which this is allowed.
    expect(
      canEditOrder({ status: "preparing", backend: "convex", user: OWNER }).allowed,
    ).toBe(false);
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

/**
 * Reading another branch's order is now blocked at the query, but a write does
 * not go through a query first — a status patch is addressed by id alone. So a
 * stale notification, a deep link, or a screen left open across a branch switch
 * could still mutate an order the account may not see.
 *
 * The check is the same predicate the read path uses, so there is one answer to
 * "is this order mine" rather than two that can drift.
 */
describe("canEditOrder branch scope", () => {
  const NORTH = { kind: "branch", outletId: "outlet-north" } as const;
  const STORE_WIDE = { kind: "all" } as const;

  it("allows editing an order at the account's own branch", () => {
    const gate = canEditOrder({
      status: "pending",
      backend: "platform",
      user: OWNER,
      scope: NORTH,
      order: { outlet_id: "outlet-north" },
    });

    expect(gate.allowed).toBe(true);
  });

  it("refuses editing an order at another branch", () => {
    const gate = canEditOrder({
      status: "pending",
      backend: "platform",
      user: OWNER,
      scope: NORTH,
      order: { outlet_id: "outlet-south" },
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/branch/i);
  });

  it("refuses an order attributed to no branch", () => {
    // Matches `isOrderInScope`: unattributed means "not taken by this branch".
    const gate = canEditOrder({
      status: "pending",
      backend: "platform",
      user: OWNER,
      scope: NORTH,
      order: { outlet_id: null },
    });

    expect(gate.allowed).toBe(false);
  });

  it("reads the branch out of customerData when there is no column", () => {
    // Convex and tenant-owned projects have no column at all.
    const gate = canEditOrder({
      status: "pending",
      backend: "convex",
      user: OWNER,
      scope: NORTH,
      order: { customerData: { outlet_id: "outlet-north" } },
    });

    expect(gate.allowed).toBe(true);
  });

  it("allows a store-wide account to edit any branch's order", () => {
    const gate = canEditOrder({
      status: "pending",
      backend: "platform",
      user: OWNER,
      scope: STORE_WIDE,
      order: { outlet_id: "outlet-south" },
    });

    expect(gate.allowed).toBe(true);
  });

  it("stays permissive when no scope is supplied", () => {
    // Every existing caller passes no scope, and a single-location store has no
    // branch to check. Omitting it must not start refusing edits.
    const gate = canEditOrder({ status: "pending", backend: "platform", user: OWNER });

    expect(gate.allowed).toBe(true);
  });

  it("reports the final-status refusal ahead of the branch one", () => {
    // A delivered order is not editable by anyone, so telling a manager it
    // belongs to another branch would send them to ask for access that would
    // not help.
    const gate = canEditOrder({
      status: "delivered",
      backend: "platform",
      user: OWNER,
      scope: NORTH,
      order: { outlet_id: "outlet-south" },
    });

    expect(gate.reason).toMatch(/delivered/i);
  });
});
