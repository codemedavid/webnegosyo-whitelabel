/**
 * Taking payment on an order that is already placed.
 *
 * Until now the only way to settle an unpaid order was to open it in the
 * register and re-tender it, which rewrites the bill to collect money that was
 * never in dispute. A cashier looking at "STILL OWING ₱149.00" wants to take
 * ₱149.00, not edit an order.
 *
 * The money rules live here rather than on the screen because Jest cannot
 * import `app/`, so anything decided there is decided untested. The two that
 * matter: nobody may collect more than is owed, and a refund is not a
 * collection with a minus sign — it has its own permission.
 */

import { canCollectPayment, validateCollectAmount } from "./order-collect";
import type { StaffPermissionHolder } from "./staff-permissions";

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };
const CASHIER: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["orders", "pos"],
};
const RUNNER: StaffPermissionHolder = {
  role: "admin",
  isOwner: false,
  permissions: ["orders"],
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    status: "confirmed",
    backend: "platform" as const,
    user: OWNER,
    balance: 149,
    ledger: "available" as const,
    ...overrides,
  };
}

describe("canCollectPayment", () => {
  it("lets a cashier collect what is still owed", () => {
    expect(canCollectPayment(request())).toEqual({ allowed: true });
  });

  it("allows it on an order the kitchen has already started", () => {
    // Unlike editing, taking money owed does not desynchronise the ticket from
    // what is being cooked — most orders are in fact paid at handover.
    expect(canCollectPayment(request({ status: "preparing" })).allowed).toBe(true);
  });

  it("allows it on a delivered order that was never paid", () => {
    expect(canCollectPayment(request({ status: "delivered" })).allowed).toBe(true);
  });

  it("refuses on a cancelled order", () => {
    const gate = canCollectPayment(request({ status: "cancelled" }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/cancelled/i);
  });

  it("refuses when the order is already square", () => {
    const gate = canCollectPayment(request({ balance: 0 }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/paid|settled/i);
  });

  it("refuses when money is owed back rather than owed", () => {
    // A refund moves money out of the drawer and has its own permission. Doing
    // it through the collect box would route around that entirely.
    const gate = canCollectPayment(request({ balance: -50 }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/refund/i);
  });

  it("refuses when the payment ledger could not be loaded", () => {
    // Without the ledger the balance shown is a guess, and collecting against
    // a guess double-charges a customer who already paid.
    const gate = canCollectPayment(request({ ledger: "unavailable" }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/payment history|could not be loaded/i);
  });

  it("refuses on a store whose deployment has no ledger, and says why", () => {
    // The ledger is empty rather than unknown here, but the mutation that
    // records a payment is missing from that bundle too — so the honest answer
    // is "this store needs updating", not "it could not be loaded".
    const gate = canCollectPayment(request({ ledger: "absent" }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/update/i);
  });

  it("refuses on a backend with no way to write a payment", () => {
    const gate = canCollectPayment(request({ backend: "supabase" }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/backend/i);
  });

  it("allows it for staff who work the register", () => {
    expect(canCollectPayment(request({ user: CASHIER })).allowed).toBe(true);
  });

  it("refuses staff who only move orders along", () => {
    const gate = canCollectPayment(request({ user: RUNNER }));

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/permission/i);
  });

  it("refuses an order taken by another branch", () => {
    const gate = canCollectPayment(
      request({
        scope: { kind: "branch", outletId: "makati" },
        order: { outletId: "bgc" },
      }),
    );

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/branch/i);
  });

  it("reports the cancelled order ahead of a missing permission", () => {
    // Nothing a manager grants makes a cancelled order collectable, so sending
    // someone to ask for a permission would waste the asking.
    const gate = canCollectPayment(request({ status: "cancelled", user: RUNNER }));

    expect(gate.reason).toMatch(/cancelled/i);
  });
});

describe("validateCollectAmount", () => {
  it("accepts the full balance", () => {
    expect(validateCollectAmount("149", 149)).toEqual({ ok: true, amount: 149 });
  });

  it("accepts a part payment", () => {
    expect(validateCollectAmount("50", 149)).toEqual({ ok: true, amount: 50 });
  });

  it("accepts centavos", () => {
    expect(validateCollectAmount("49.50", 149)).toEqual({ ok: true, amount: 49.5 });
  });

  it("ignores surrounding whitespace", () => {
    expect(validateCollectAmount("  50 ", 149)).toEqual({ ok: true, amount: 50 });
  });

  it("refuses an empty box", () => {
    const result = validateCollectAmount("", 149);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/amount/i) });
  });

  it("refuses text that is not a number", () => {
    expect(validateCollectAmount("fifty", 149).ok).toBe(false);
  });

  it("refuses zero", () => {
    const result = validateCollectAmount("0", 149);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/more than zero/i) });
  });

  it("refuses a negative, which would be a refund in disguise", () => {
    expect(validateCollectAmount("-20", 149).ok).toBe(false);
  });

  /**
   * The one rule worth the module. Over-collecting turns a paid order into one
   * the merchant owes money back on, and the refund that unwinds it needs a
   * permission the cashier may not have.
   */
  it("refuses more than is owed", () => {
    const result = validateCollectAmount("200", 149);

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/149/) });
  });

  it("allows a centavo of float drift at the top of the range", () => {
    // 149.00 typed against a balance that computed to 148.999999 is the same
    // money, and refusing it would strand the cashier on the last payment.
    expect(validateCollectAmount("149", 148.999999).ok).toBe(true);
  });
});
