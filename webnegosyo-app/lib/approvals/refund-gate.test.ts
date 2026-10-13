import { isRefundNeedsApprovalError, REFUND_NEEDS_APPROVAL_MESSAGE, refundGate } from "./refund-gate";
import type { ApprovalRules } from "./types";

const RULES: ApprovalRules = {
  directRefundCap: 300,
  managerApproveCap: 1000,
  staffRefundWindow: "same_day",
  discountPctNeedsApproval: 20,
  writeoffCostNeedsApproval: 500,
  expiryMinutes: 30,
  maxPendingPerStaff: 3,
};
const NOW = new Date("2026-10-12T04:00:00.000Z");
const TODAY = "2026-10-12T01:00:00.000Z";
const refunder = { role: "admin", isOwner: false, permissions: ["pos", "orders", "order_refund"] };
const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
const owner = { role: "admin", isOwner: true, permissions: null };
const base = { amount: 185, now: NOW, orderCreatedAt: TODAY, isApprovalsStore: true };

describe("refundGate (mirrors the server's direct-refund limit)", () => {
  test("within the staff cap on a same-day order: allowed", () => {
    expect(refundGate({ ...base, user: refunder, rules: { status: "known", rules: RULES } })).toEqual({ allowed: true });
  });

  test("over the cap, or an earlier day's order: ask a manager", () => {
    const over = refundGate({ ...base, amount: 301, user: refunder, rules: { status: "known", rules: RULES } });
    expect(over).toEqual({ allowed: false, reason: REFUND_NEEDS_APPROVAL_MESSAGE, needsApproval: true });
    const yesterday = refundGate({ ...base, orderCreatedAt: "2026-10-11T03:00:00.000Z", user: refunder, rules: { status: "known", rules: RULES } });
    expect(yesterday.needsApproval).toBe(true);
  });

  test("without the Refunds grant: ask a manager", () => {
    expect(refundGate({ ...base, user: cashier, rules: { status: "known", rules: RULES } })).toMatchObject({ allowed: false, needsApproval: true });
  });

  test("owners always act; rules still loading wait; unreadable rules fail closed", () => {
    expect(refundGate({ ...base, user: owner, rules: { status: "unknown" } })).toEqual({ allowed: true });
    expect(refundGate({ ...base, user: refunder, rules: { status: "loading" } })).toEqual({ allowed: false, reason: "Checking your refund limit…" });
    expect(refundGate({ ...base, user: refunder, rules: { status: "unknown" } })).toMatchObject({ allowed: false, needsApproval: true });
  });

  test("other store types keep the plain permission check", () => {
    expect(refundGate({ ...base, amount: 5000, isApprovalsStore: false, user: refunder, rules: { status: "unknown" } })).toEqual({ allowed: true });
    expect(refundGate({ ...base, isApprovalsStore: false, user: cashier, rules: { status: "unknown" } })).toEqual({
      allowed: false,
      reason: "You do not have permission to issue refunds.",
    });
  });
});

describe("isRefundNeedsApprovalError", () => {
  test("recognises the server's refusal however it is wrapped", () => {
    expect(isRefundNeedsApprovalError(new Error(`new row violates check: ${REFUND_NEEDS_APPROVAL_MESSAGE}`))).toBe(true);
    expect(isRefundNeedsApprovalError({ message: REFUND_NEEDS_APPROVAL_MESSAGE })).toBe(true);
    expect(isRefundNeedsApprovalError(new Error("network down"))).toBe(false);
    expect(isRefundNeedsApprovalError(null)).toBe(false);
  });
});
