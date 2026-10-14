/**
 * Who may do what with approvals, as the app decides its UX — pure.
 *
 * The server (src/lib/approvals/rules.ts + the SQL twins) is the authority:
 * these only choose which button a screen shows. `predictRoute` mirrors the
 * server's decideRoute so the request sheet can say "Refund ₱185 now" vs
 * "Send for approval · ₱185"; the create response then reports what actually
 * happened, so a disagreement only ever costs a label.
 */
import type { OrderBackend } from "../order-backend";
import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import { firstName, joinNames } from "./state";
import type { ApprovalKind, ApprovalRules } from "./types";

export type RouteUser = StaffPermissionHolder;

/** Asia/Manila is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function isOwnerLike(user: RouteUser): boolean {
  return user.role === "superadmin" || user.isOwner;
}

/** Owner / superadmin, or holders of `approve_requests` (opt-in, never via full access). */
export function canReviewApprovals(user: RouteUser): boolean {
  return hasPermission(user, "approve_requests");
}

/** Approval rules are the owner's alone (the server refuses everyone else). */
export function canEditApprovalRules(user: RouteUser): boolean {
  return isOwnerLike(user);
}

/** Anyone who works the register or the orders may ask (server: mayRequest). */
export function canAskForApproval(user: RouteUser): boolean {
  return hasPermission(user, "orders") || hasPermission(user, "pos");
}

/** Refunds and paid cancels run on the shared platform database only (contract). */
export function isApprovalsStore(session: { orderBackend: OrderBackend | null }): boolean {
  return session.orderBackend === "platform";
}

/** The review screen: approvers decide there; the people who ask read their own answer. */
export function canOpenApprovalReview(user: RouteUser, session: { orderBackend: OrderBackend | null }): boolean {
  return isApprovalsStore(session) && (canReviewApprovals(user) || canAskForApproval(user));
}

const toCentavos = (pesos: number): number => Math.round(pesos * 100);
const manilaDay = (at: Date): string => new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

export interface RouteInput {
  user: RouteUser;
  kind: Extract<ApprovalKind, "refund" | "cancel_paid">;
  amount: number;
  /** Null when the rules could not be read: assume the request path. */
  rules: ApprovalRules | null;
  now: Date;
  orderCreatedAt: string | null;
}

function withinStaffLimit(input: RouteInput, rules: ApprovalRules): boolean {
  const { user, kind, amount, now, orderCreatedAt } = input;
  if (!hasPermission(user, "order_refund")) return false;
  if (kind === "cancel_paid" && !hasPermission(user, "orders")) return false;
  if (toCentavos(amount) > toCentavos(rules.directRefundCap)) return false;
  if (rules.staffRefundWindow === "any") return true;
  return orderCreatedAt !== null && manilaDay(new Date(orderCreatedAt)) === manilaDay(now);
}

/** "direct" = the server will do it at once; "request" = someone is asked. */
export function predictRoute(input: RouteInput): "direct" | "request" {
  if (isOwnerLike(input.user)) return "direct";
  const { rules } = input;
  if (!rules) return "request";
  if (hasPermission(input.user, "approve_requests") && toCentavos(input.amount) <= toCentavos(rules.managerApproveCap)) {
    return "direct";
  }
  return withinStaffLimit(input, rules) ? "direct" : "request";
}

export interface ApproverEntry {
  userId: string;
  name: string | null;
  outletId: string | null;
}

export interface WhoInput {
  approvers: readonly ApproverEntry[];
  /** The order's branch (null = store-wide). */
  outletId: string | null;
  amount: number;
  rules: ApprovalRules;
  selfUserId: string | null;
}

/**
 * "Marco, Bea and the owner will get a notification." — the managers who
 * reach the branch and whose limit covers the amount, then the owner (who is
 * always asked). Mirrors the server's selectApprovalTargets.
 */
export function whoWillBeAsked(input: WhoInput): string {
  const covers = toCentavos(input.amount) <= toCentavos(input.rules.managerApproveCap);
  const names = covers
    ? input.approvers
        .filter((approver) => approver.userId !== input.selfUserId)
        .filter((approver) => approver.outletId === null || approver.outletId === input.outletId)
        .map((approver) => firstName(approver.name))
    : [];
  if (names.length === 0) return "The owner will get a notification.";
  return `${joinNames([...names, "the owner"], "and")} will get a notification.`;
}
