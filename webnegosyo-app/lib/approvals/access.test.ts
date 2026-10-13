import {
  canAskForApproval,
  canOpenApprovalReview,
  canEditApprovalRules,
  canReviewApprovals,
  isApprovalsStore,
  predictRoute,
  whoWillBeAsked,
  type RouteUser,
} from "./access";
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

const owner: RouteUser = { role: "admin", isOwner: true, permissions: null };
const fullAccess: RouteUser = { role: "admin", isOwner: false, permissions: null };
const cashier: RouteUser = { role: "admin", isOwner: false, permissions: ["pos"] };
const refunder: RouteUser = { role: "admin", isOwner: false, permissions: ["pos", "orders", "order_refund"] };
const manager: RouteUser = { role: "admin", isOwner: false, permissions: ["orders", "approve_requests"] };
const kitchen: RouteUser = { role: "admin", isOwner: false, permissions: ["kitchen"] };

const NOW = new Date("2026-10-12T04:00:00.000Z"); // 12:00 PM Manila
const TODAY = "2026-10-12T01:00:00.000Z";
const YESTERDAY = "2026-10-11T08:00:00.000Z";

describe("approval gates", () => {
  test("owners, superadmins and approve_requests holders review; full access alone does not", () => {
    expect(canReviewApprovals(owner)).toBe(true);
    expect(canReviewApprovals({ role: "superadmin", isOwner: false, permissions: [] })).toBe(true);
    expect(canReviewApprovals(manager)).toBe(true);
    expect(canReviewApprovals(fullAccess)).toBe(false);
    expect(canReviewApprovals(cashier)).toBe(false);
  });

  test("only the owner edits the rules", () => {
    expect(canEditApprovalRules(owner)).toBe(true);
    expect(canEditApprovalRules({ role: "superadmin", isOwner: false, permissions: [] })).toBe(true);
    expect(canEditApprovalRules(manager)).toBe(false);
    expect(canEditApprovalRules(fullAccess)).toBe(false);
  });

  test("anyone on the register or the orders may ask; the kitchen may not", () => {
    expect(canAskForApproval(cashier)).toBe(true);
    expect(canAskForApproval(refunder)).toBe(true);
    expect(canAskForApproval(kitchen)).toBe(false);
  });

  test("only platform stores have approvals", () => {
    expect(isApprovalsStore({ orderBackend: "platform" })).toBe(true);
    expect(isApprovalsStore({ orderBackend: "convex" })).toBe(false);
    expect(isApprovalsStore({ orderBackend: "supabase" })).toBe(false);
    expect(isApprovalsStore({ orderBackend: null })).toBe(false);
  });
});

describe("canOpenApprovalReview", () => {
  test("approvers and the people who ask, on a platform store", () => {
    expect(canOpenApprovalReview(manager, { orderBackend: "platform" })).toBe(true);
    expect(canOpenApprovalReview(cashier, { orderBackend: "platform" })).toBe(true);
    expect(canOpenApprovalReview(kitchen, { orderBackend: "platform" })).toBe(false);
    expect(canOpenApprovalReview(owner, { orderBackend: "convex" })).toBe(false);
  });
});

describe("predictRoute (the sheet's button, mirrors the server's decideRoute)", () => {
  const base = { kind: "refund" as const, rules: RULES, now: NOW, orderCreatedAt: TODAY };

  test("an owner always acts now", () => {
    expect(predictRoute({ ...base, user: owner, amount: 5000 })).toBe("direct");
  });

  test("a manager acts now within their cap and asks above it", () => {
    expect(predictRoute({ ...base, user: manager, amount: 1000 })).toBe("direct");
    expect(predictRoute({ ...base, user: manager, amount: 1000.01 })).toBe("request");
  });

  test("staff with Refunds act now up to the staff cap on a same-day order", () => {
    expect(predictRoute({ ...base, user: refunder, amount: 300 })).toBe("direct");
    expect(predictRoute({ ...base, user: refunder, amount: 301 })).toBe("request");
    expect(predictRoute({ ...base, user: refunder, amount: 100, orderCreatedAt: YESTERDAY })).toBe("request");
    expect(
      predictRoute({ ...base, user: refunder, amount: 100, orderCreatedAt: YESTERDAY, rules: { ...RULES, staffRefundWindow: "any" } }),
    ).toBe("direct");
  });

  test("without Refunds a cashier always asks", () => {
    expect(predictRoute({ ...base, user: cashier, amount: 10 })).toBe("request");
  });

  test("cancelling a paid order directly also needs the orders grant", () => {
    const refundOnly: RouteUser = { role: "admin", isOwner: false, permissions: ["pos", "order_refund"] };
    expect(predictRoute({ ...base, kind: "cancel_paid", user: refundOnly, amount: 100 })).toBe("request");
    expect(predictRoute({ ...base, kind: "cancel_paid", user: refunder, amount: 100 })).toBe("direct");
  });

  test("unknown rules mean ask (the server may still do it at once)", () => {
    expect(predictRoute({ ...base, rules: null, user: refunder, amount: 10 })).toBe("request");
    expect(predictRoute({ ...base, rules: null, user: owner, amount: 10 })).toBe("direct");
  });
});

describe("whoWillBeAsked", () => {
  const approvers = [
    { userId: "m1", name: "Marco Santos", outletId: null },
    { userId: "m2", name: "Bea Cruz", outletId: "makati" },
    { userId: "m3", name: "Jo Lim", outletId: "bgc" },
  ];

  test("names the managers who reach the branch and can cover the amount, then the owner", () => {
    expect(whoWillBeAsked({ approvers, outletId: "makati", amount: 185, rules: RULES, selfUserId: "x" })).toBe(
      "Marco, Bea and the owner will get a notification.",
    );
  });

  test("above the manager cap only the owner is asked", () => {
    expect(whoWillBeAsked({ approvers, outletId: "makati", amount: 1500, rules: RULES, selfUserId: "x" })).toBe(
      "The owner will get a notification.",
    );
  });

  test("never names the person asking", () => {
    expect(whoWillBeAsked({ approvers, outletId: "bgc", amount: 50, rules: RULES, selfUserId: "m1" })).toBe(
      "Jo and the owner will get a notification.",
    );
  });
});
