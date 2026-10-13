/**
 * Approvals — shared vocabulary (Phase 3 of Store Activity & Approvals).
 * Contract: docs/plans/store-activity/contract.md ("Approvals").
 * Mirrored for the merchant app in webnegosyo-app/lib/approvals/types.ts.
 */

export const APPROVAL_KINDS = ['refund', 'cancel_paid', 'discount', 'stock_writeoff'] as const
export type ApprovalKind = (typeof APPROVAL_KINDS)[number]

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'executing',
  'executed',
  'failed',
  'declined',
  'expired',
  'withdrawn',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/**
 * `balance` = give back an OVERPAID balance (paid − refunded − total) without
 * touching the order's total or lines (e.g. after an edit lowered the total).
 */
export const REFUND_SCOPES = ['items', 'amount', 'whole', 'balance'] as const
export type RefundScope = (typeof REFUND_SCOPES)[number]

export type StaffRefundWindow = 'same_day' | 'any'

/** Per-store limits; pesos (the DB stores numeric(12,2)). */
export interface ApprovalRules {
  directRefundCap: number
  managerApproveCap: number
  staffRefundWindow: StaffRefundWindow
  discountPctNeedsApproval: number
  writeoffCostNeedsApproval: number
  expiryMinutes: number
  maxPendingPerStaff: number
  updatedAt?: string | null
  updatedByName?: string | null
}

/** Who is acting — the app_users facts the rules need. */
export interface ApprovalActor {
  userId: string
  role: string
  isOwner: boolean
  permissions: readonly string[] | null
  outletId: string | null
}

/** camelCase view of one approval_requests row. */
export interface ApprovalRequestRecord {
  id: string
  tenantId: string
  outletId: string | null
  kind: ApprovalKind
  status: ApprovalStatus
  isDirect: boolean
  externalOrderId: string | null
  orderNumber: string | null
  payload: Record<string, unknown>
  amount: number
  approvedAmount: number | null
  reasonCode: string
  note: string | null
  orderSnapshot: Record<string, unknown> | null
  requestedBy: string
  requestedByName: string | null
  requesterShiftId: string | null
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionReasonCode: string | null
  decisionNote: string | null
  expiresAt: string
  executedAt: string | null
  result: Record<string, unknown> | null
  error: string | null
  createdAt: string
  updatedAt: string
}

/** What one viewer may do with a request (computed per caller by the server). */
export interface ApprovalViewerCapabilities {
  /** May approve (within limit, in reach, not their own unless owner). */
  canDecide: boolean
  /** May decline — also above their limit (the limit bounds yes, not no). */
  canDecline: boolean
  canWithdraw: boolean
  /** True when the viewer approves requests but this one is above their limit. */
  isOverViewerLimit: boolean
  /** Viewer's limit in pesos; null = no limit; absent when the viewer cannot approve. */
  viewerCap: number | null | undefined
}

export interface ApprovalRequestView extends ApprovalRequestRecord, ApprovalViewerCapabilities {
  /** Human label, e.g. "R-0042", once a refund executed. */
  refundLabel: string | null
}

/** The SQL functions answer {ok:false, code, message} for business refusals. */
export interface ApprovalRefusal {
  ok: false
  code: string
  message: string
  requestId?: string
  request?: Record<string, unknown>
}

/**
 * The database's refusal when a register writes a refund row beyond the
 * cashier's own limit (order_payments_refund_guard, 20261012170000). The app
 * matches this exact text to offer "Ask a manager" instead of an error.
 */
export const REFUND_NEEDS_APPROVAL_MESSAGE = 'This refund needs approval. Ask a manager to approve it.'
