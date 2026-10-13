/**
 * Approvals — the app's copy of the web DTO (src/lib/approvals/types.ts) and
 * the reason codes (src/lib/approvals/reasons.ts, design-spec §4). Pure: no
 * React Native imports, so the web parity test can read it.
 * Parity: tests/unit/approvals/app-parity.test.ts (web repo).
 */

export const APPROVAL_KINDS = ["refund", "cancel_paid", "discount", "stock_writeoff"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "executing",
  "executed",
  "failed",
  "declined",
  "expired",
  "withdrawn",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type RefundScope = "items" | "amount" | "whole";

export interface ApprovalRules {
  directRefundCap: number;
  managerApproveCap: number;
  staffRefundWindow: "same_day" | "any";
  discountPctNeedsApproval: number;
  writeoffCostNeedsApproval: number;
  expiryMinutes: number;
  maxPendingPerStaff: number;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

/** One request as GET/POST /api/approvals returns it for THIS viewer. */
export interface ApprovalRequestView {
  id: string;
  tenantId: string;
  outletId: string | null;
  kind: ApprovalKind;
  status: ApprovalStatus;
  isDirect: boolean;
  externalOrderId: string | null;
  orderNumber: string | null;
  payload: Record<string, unknown>;
  amount: number;
  approvedAmount: number | null;
  reasonCode: string;
  note: string | null;
  orderSnapshot: Record<string, unknown> | null;
  requestedBy: string;
  requestedByName: string | null;
  requesterShiftId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReasonCode: string | null;
  decisionNote: string | null;
  expiresAt: string;
  executedAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  refundLabel: string | null;
  canDecide: boolean;
  canWithdraw: boolean;
  isOverViewerLimit: boolean;
  /** Viewer's limit in pesos; null = no limit; absent = cannot approve. */
  viewerCap?: number | null;
}

export type RefundPayload =
  | { scope: "items"; lines: { orderItemId: string; quantity: number }[]; restock?: boolean }
  | { scope: "amount"; amount: number; restock?: boolean }
  | { scope: "whole"; restock?: boolean };

export type CreateApprovalInput =
  | { kind: "refund"; orderId: string; payload: RefundPayload; reasonCode: string; note?: string; idempotencyKey: string }
  | { kind: "cancel_paid"; orderId: string; payload: { restock?: boolean }; reasonCode: string; note?: string; idempotencyKey: string }
  | {
      kind: "discount";
      orderId: string;
      payload: { amountOff: number; pct: number };
      reasonCode: string;
      note?: string;
      idempotencyKey: string;
    }
  | {
      kind: "stock_writeoff";
      payload: { inventoryItemId: string; quantity: number; outletId?: string | null };
      reasonCode: string;
      note?: string;
      idempotencyKey: string;
    };

export interface CreateApprovalResult {
  route: "direct" | "request";
  replayed: boolean;
  /** First names of who was asked (owner last), for "Sending to Marco and Lorna…". */
  approvers: string[];
  request: ApprovalRequestView;
}

export interface ReasonOption {
  code: string;
  label: string;
  restockByDefault?: boolean;
}

export const REFUND_REASONS: readonly ReasonOption[] = [
  { code: "wrong_item", label: "Wrong item served", restockByDefault: false },
  { code: "food_quality", label: "Food quality", restockByDefault: false },
  { code: "missing_item", label: "Missing item", restockByDefault: true },
  { code: "took_too_long", label: "Took too long", restockByDefault: false },
  { code: "charged_twice", label: "Charged twice", restockByDefault: false },
  { code: "changed_mind", label: "Customer changed mind", restockByDefault: true },
  { code: "other", label: "Other", restockByDefault: false },
];

export const CANCEL_PAID_REASONS: readonly ReasonOption[] = [
  { code: "customer_left", label: "Customer left", restockByDefault: true },
  { code: "changed_mind", label: "Customer changed mind", restockByDefault: true },
  { code: "ordered_twice", label: "Ordered twice by mistake", restockByDefault: true },
  { code: "wrong_order", label: "Wrong order entered", restockByDefault: true },
  { code: "item_ran_out", label: "Item ran out", restockByDefault: true },
  { code: "store_closing", label: "Store closing", restockByDefault: true },
  { code: "other", label: "Other", restockByDefault: false },
];

export const DISCOUNT_REASONS: readonly ReasonOption[] = [
  { code: "make_up", label: "Make up for a problem" },
  { code: "regular", label: "Regular customer (suki)" },
  { code: "promo_missing", label: "Promo not in the system" },
  { code: "staff_meal", label: "Staff meal" },
  { code: "owner_guest", label: "Owner's guest" },
  { code: "other", label: "Other" },
];

export const WRITEOFF_REASONS: readonly ReasonOption[] = [
  { code: "spoiled", label: "Spoiled" },
  { code: "expired", label: "Expired" },
  { code: "dropped", label: "Dropped or spilled" },
  { code: "cooking_mistake", label: "Cooking mistake" },
  { code: "returned", label: "Returned by customer" },
  { code: "count_correction", label: "Count correction" },
  { code: "other", label: "Other" },
];

export const DECLINE_REASONS: readonly ReasonOption[] = [
  { code: "talk_first", label: "Let's talk first" },
  { code: "offer_replacement", label: "Offer a replacement instead" },
  { code: "check_amount", label: "Amount looks off, please check" },
  { code: "already_handled", label: "Already handled" },
  { code: "not_policy", label: "Not covered by our policy" },
  { code: "other", label: "Other" },
];

export const REASONS_BY_KIND: Readonly<Record<ApprovalKind, readonly ReasonOption[]>> = {
  refund: REFUND_REASONS,
  cancel_paid: CANCEL_PAID_REASONS,
  discount: DISCOUNT_REASONS,
  stock_writeoff: WRITEOFF_REASONS,
};
