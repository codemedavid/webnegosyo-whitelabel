/**
 * May this cashier record a refund straight into the ledger? — pure.
 *
 * The server now refuses a client `order_payments` refund row above the
 * caller's direct limit with REFUND_NEEDS_APPROVAL_MESSAGE (security review
 * H1). This mirrors that limit (same Manila day, ≤ the staff cap; approvers
 * up to their cap; owners always) so the register shows "Ask a manager to
 * approve" BEFORE the edit is saved, instead of after the bill was rewritten.
 * Unreadable rules fail closed on platform stores; other store types keep the
 * plain permission check.
 */
import { canIssueRefund } from "../order-edit-guards";
import type { StaffPermissionHolder } from "../staff-permissions";
import { predictRoute } from "./access";
import type { ApprovalRules } from "./types";

export const REFUND_NEEDS_APPROVAL_MESSAGE = "This refund needs approval. Ask a manager to approve it.";

export type RulesState = { status: "known"; rules: ApprovalRules } | { status: "loading" } | { status: "unknown" };

export interface RefundGateResult {
  allowed: boolean;
  reason?: string;
  /** The ask-a-manager path applies. */
  needsApproval?: boolean;
}

export interface RefundGateInput {
  user: StaffPermissionHolder;
  amount: number;
  rules: RulesState;
  now: Date;
  orderCreatedAt: string | null;
  isApprovalsStore: boolean;
}

const NEEDS_APPROVAL: RefundGateResult = { allowed: false, reason: REFUND_NEEDS_APPROVAL_MESSAGE, needsApproval: true };

export function refundGate(input: RefundGateInput): RefundGateResult {
  const base = canIssueRefund(input.user);
  if (!input.isApprovalsStore) return base.allowed ? { allowed: true } : { allowed: false, reason: base.reason };
  if (input.user.role === "superadmin" || input.user.isOwner) return { allowed: true };
  if (!base.allowed) return NEEDS_APPROVAL;
  if (input.rules.status === "loading") return { allowed: false, reason: "Checking your refund limit…" };
  if (input.rules.status === "unknown") return NEEDS_APPROVAL;
  const route = predictRoute({
    user: input.user,
    kind: "refund",
    amount: input.amount,
    rules: input.rules.rules,
    now: input.now,
    orderCreatedAt: input.orderCreatedAt,
  });
  return route === "direct" ? { allowed: true } : NEEDS_APPROVAL;
}

/** The server's refusal of a refund row above the cashier's limit, however it was wrapped. */
export function isRefundNeedsApprovalError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  return message.includes(REFUND_NEEDS_APPROVAL_MESSAGE);
}
