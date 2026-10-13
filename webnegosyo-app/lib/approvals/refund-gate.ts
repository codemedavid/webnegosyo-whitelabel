/**
 * May this cashier record a refund straight into the ledger? — pure.
 *
 * The database refuses a client `order_payments` refund row beyond the
 * caller's own limit (order_payments_refund_guard, 20261012170000) with
 * REFUND_NEEDS_APPROVAL_MESSAGE. The register's edit saves the order revision
 * BEFORE the refund row, so the decision must be made here, first: this is
 * the twin of the server's `refundWithinOwnLimit` (src/lib/approvals/rules.ts):
 *   - owner / superadmin: unlimited;
 *   - approve_requests: the order's refunds so far + this one ≤ manager cap;
 *   - order_refund: the order's refunds so far + this one ≤ staff cap, on an
 *     order from the same Manila day (unless the store allows any day).
 * The person's direct refunds today (≤ manager cap) are not readable on the
 * phone; that last check stays the database's, and a refusal after the save
 * is handled on the register (see pos-tender).
 * Unreadable rules fail closed on platform stores; other store types keep the
 * plain permission check.
 */
import { canIssueRefund } from "../order-edit-guards";
import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import { REFUND_NEEDS_APPROVAL_MESSAGE, type ApprovalRules } from "./types";

export { REFUND_NEEDS_APPROVAL_MESSAGE };

/** Asia/Manila is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export type RulesState = { status: "known"; rules: ApprovalRules } | { status: "loading" } | { status: "unknown" };

export interface RefundGateResult {
  allowed: boolean;
  reason?: string;
  /** The ask-a-manager path applies. */
  needsApproval?: boolean;
}

export interface RefundGateInput {
  user: StaffPermissionHolder;
  /** This refund, pesos. */
  amount: number;
  /** What the order already gave back (ledger refunds), pesos. */
  orderRefunded: number;
  rules: RulesState;
  now: Date;
  orderCreatedAt: string | null;
  isApprovalsStore: boolean;
}

const NEEDS_APPROVAL: RefundGateResult = { allowed: false, reason: REFUND_NEEDS_APPROVAL_MESSAGE, needsApproval: true };

const toCentavos = (pesos: number): number => Math.round(pesos * 100);
const manilaDay = (at: Date): string => new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

/** The order-level half of refundWithinOwnLimit (the caller has the permission or the approver grant). */
function withinOwnLimit(input: RefundGateInput, rules: ApprovalRules): boolean {
  const orderTotal = toCentavos(input.orderRefunded) + toCentavos(input.amount);
  if (hasPermission(input.user, "approve_requests") && orderTotal <= toCentavos(rules.managerApproveCap)) return true;
  if (!hasPermission(input.user, "order_refund")) return false;
  if (orderTotal > toCentavos(rules.directRefundCap)) return false;
  if (toCentavos(input.amount) > toCentavos(rules.managerApproveCap)) return false;
  if (rules.staffRefundWindow === "any") return true;
  return input.orderCreatedAt !== null && manilaDay(new Date(input.orderCreatedAt)) === manilaDay(input.now);
}

export function refundGate(input: RefundGateInput): RefundGateResult {
  const base = canIssueRefund(input.user);
  if (!input.isApprovalsStore) return base.allowed ? { allowed: true } : { allowed: false, reason: base.reason };
  if (input.user.role === "superadmin" || input.user.isOwner) return { allowed: true };
  if (!base.allowed && !hasPermission(input.user, "approve_requests")) return NEEDS_APPROVAL;
  if (input.rules.status === "loading") return { allowed: false, reason: "Checking your refund limit…" };
  if (input.rules.status === "unknown") return NEEDS_APPROVAL;
  return withinOwnLimit(input, input.rules.rules) ? { allowed: true } : NEEDS_APPROVAL;
}

/** The sum of the ledger's refund rows (pesos). */
export function ledgerRefunded(payments: readonly { kind: string; amount: number }[]): number {
  return Math.round(payments.filter((payment) => payment.kind === "refund").reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
}

/** The database's refusal of a refund row beyond the cashier's limit, however it was wrapped. */
export function isRefundNeedsApprovalError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  return message.includes(REFUND_NEEDS_APPROVAL_MESSAGE);
}
