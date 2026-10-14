/**
 * Who may act directly, who must ask, and who may answer — pure.
 *
 * The SQL twins (approval_direct_allowed / approval_approver_cap in
 * supabase/migrations/20261012160000_approvals.sql) are the database's own
 * check; this module decides the UX (which button the sheet shows, who gets
 * the push) and is what the tests pin. Change both together.
 *
 * Money is compared in CENTAVOS (integers), never as floats.
 */
import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { ApprovalActor, ApprovalKind, ApprovalRules } from './types'

export const DEFAULT_APPROVAL_RULES: Readonly<ApprovalRules> = Object.freeze({
  directRefundCap: 300,
  managerApproveCap: 1000,
  staffRefundWindow: 'same_day',
  discountPctNeedsApproval: 20,
  writeoffCostNeedsApproval: 500,
  expiryMinutes: 30,
  maxPendingPerStaff: 3,
})

/** Asia/Manila is UTC+8 all year (no DST). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100)
}

export function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100
}

export function manilaDayKey(at: Date): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

export function isSameManilaDay(a: Date, b: Date): boolean {
  return manilaDayKey(a) === manilaDayKey(b)
}

function holds(actor: ApprovalActor, key: StaffPermissionKey): boolean {
  return hasPermission(
    { role: actor.role, is_owner: actor.isOwner, permissions: actor.permissions ? [...actor.permissions] : actor.permissions },
    key,
  )
}

export function isOwnerLike(actor: ApprovalActor): boolean {
  return actor.role === 'superadmin' || (actor.role === 'admin' && actor.isOwner)
}

/**
 * The most this person may say yes to, in centavos. `null` = no limit (owner);
 * `-1` = may not approve at all.
 */
export function approverCapCentavos(actor: ApprovalActor, rules: ApprovalRules): number | null {
  if (isOwnerLike(actor)) return null
  if (holds(actor, 'approve_requests')) return toCentavos(rules.managerApproveCap)
  return -1
}

export function canApproveAtAll(actor: ApprovalActor, rules: ApprovalRules): boolean {
  return approverCapCentavos(actor, rules) !== -1
}

/** Whether `actor` may reach a request filed at `outletId` (null = store-wide). */
export function reachesOutlet(actor: ApprovalActor, outletId: string | null): boolean {
  if (isOwnerLike(actor)) return true
  return actor.outletId === null || actor.outletId === outletId
}

/** May this person ask at all? (Anyone who works the register or the orders.) */
export function mayRequest(actor: ApprovalActor, kind: ApprovalKind): boolean {
  if (holds(actor, 'orders') || holds(actor, 'pos')) return true
  return kind === 'stock_writeoff' && holds(actor, 'menu')
}

export interface RouteInput {
  actor: ApprovalActor
  kind: ApprovalKind
  /** Server-computed amount (approval_quote), in centavos. */
  amountCentavos: number
  rules: ApprovalRules
  now: Date
  /** When the order was placed (refund / cancel_paid same-day rule). */
  orderCreatedAt?: Date | null
  /** Discount percent (discount only). */
  discountPct?: number | null
  /** Senior Citizen / PWD (RA 9994 / RA 10754): never gated. */
  isStatutory?: boolean
  /** What the order already gave back (refund / cancel_paid), centavos. */
  orderRefundedCentavos?: number
  /** What this person already refunded DIRECTLY today (Manila), centavos. */
  requesterDirectTodayCentavos?: number
  /** Write-off of an ingredient with no cost on file: never direct. */
  isCostUnknown?: boolean
}

export type RouteDecision =
  | { route: 'direct' }
  | { route: 'request'; approverNeeded: 'manager' | 'owner' }
  | { route: 'refused'; code: 'statutory_not_gated' | 'forbidden'; message: string }

/**
 * Refund / cancel within the person's own limit — the TS twin of
 * approval_refund_within_own_limit (20261012170000). Cumulative on purpose:
 * the ORDER's refunds stay within the cap however they are split, and an
 * order_refund holder's direct refunds today stay within the manager cap.
 */
export function refundWithinOwnLimit(input: RouteInput): boolean {
  const { actor, kind, amountCentavos, rules } = input
  if (isOwnerLike(actor)) return true
  const orderTotal = (input.orderRefundedCentavos ?? 0) + amountCentavos
  const cap = approverCapCentavos(actor, rules)
  if (cap !== null && cap >= 0 && orderTotal <= cap) return true
  if (!holds(actor, 'order_refund')) return false
  if (kind === 'cancel_paid' && !holds(actor, 'orders')) return false
  if (orderTotal > toCentavos(rules.directRefundCap)) return false
  if ((input.requesterDirectTodayCentavos ?? 0) + amountCentavos > toCentavos(rules.managerApproveCap)) return false
  if (rules.staffRefundWindow === 'any') return true
  return input.orderCreatedAt != null && isSameManilaDay(input.orderCreatedAt, input.now)
}

function directWithinOwnLimit(input: RouteInput): boolean {
  const { actor, kind, amountCentavos, rules } = input
  if (kind === 'refund' || kind === 'cancel_paid') return refundWithinOwnLimit(input)
  if (kind === 'discount') {
    return input.discountPct != null && input.discountPct <= rules.discountPctNeedsApproval
  }
  return amountCentavos <= toCentavos(rules.writeoffCostNeedsApproval) && holds(actor, 'menu')
}

/**
 * Direct (act now), request (ask someone), or refused. Order of checks
 * matches approval_direct_allowed: owner → approver within their cap →
 * the kind's own staff limit.
 */
export function decideRoute(input: RouteInput): RouteDecision {
  if (input.kind === 'discount' && input.isStatutory) {
    return {
      route: 'refused',
      code: 'statutory_not_gated',
      message: 'Senior and PWD discounts never need approval. Apply them at the register.',
    }
  }
  if (!mayRequest(input.actor, input.kind)) {
    return {
      route: 'refused',
      code: 'forbidden',
      message: 'Your account cannot ask for this. Ask the owner to give you register access.',
    }
  }
  if (isOwnerLike(input.actor)) return { route: 'direct' }

  const isRefund = input.kind === 'refund' || input.kind === 'cancel_paid'
  const isNeverDirect = input.kind === 'stock_writeoff' && input.isCostUnknown === true
  const cap = approverCapCentavos(input.actor, input.rules)
  // Refunds use the cumulative rule (refundWithinOwnLimit) for approvers too.
  const isWithinApproverCap = !isRefund && cap !== null && cap >= 0 && input.amountCentavos <= cap
  if (!isNeverDirect && (isWithinApproverCap || directWithinOwnLimit(input))) return { route: 'direct' }

  return {
    route: 'request',
    approverNeeded: input.amountCentavos <= toCentavos(input.rules.managerApproveCap) ? 'manager' : 'owner',
  }
}

export interface DecideInput {
  /** The limit bounds what one may say YES to; anyone who may answer may decline. */
  decision?: 'approve' | 'decline'
  approver: ApprovalActor
  requestedBy: string
  outletId: string | null
  /** The amount being approved (an override, or the request's), centavos. */
  amountCentavos: number
  rules: ApprovalRules
}

export type DecideCheck =
  | { ok: true }
  | { ok: false; code: 'self_approval' | 'not_approver' | 'over_limit' | 'other_branch' }

/** Mirrors transition_approval's checks for approve/decline. */
export function checkCanDecide(input: DecideInput): DecideCheck {
  const { approver } = input
  if (approver.userId === input.requestedBy && !isOwnerLike(approver)) return { ok: false, code: 'self_approval' }
  if (!reachesOutlet(approver, input.outletId)) return { ok: false, code: 'other_branch' }
  const cap = approverCapCentavos(approver, input.rules)
  if (cap === -1) return { ok: false, code: 'not_approver' }
  if (cap !== null && input.amountCentavos > cap && input.decision !== 'decline') return { ok: false, code: 'over_limit' }
  return { ok: true }
}

/** Merge a stored rules object (camelCase from approval_rules_effective) over the defaults. */
export function normalizeRules(input: unknown): ApprovalRules {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const num = (key: keyof ApprovalRules, fallback: number): number => {
    const value = Number(raw[key])
    return Number.isFinite(value) ? value : fallback
  }
  return {
    directRefundCap: num('directRefundCap', DEFAULT_APPROVAL_RULES.directRefundCap),
    managerApproveCap: num('managerApproveCap', DEFAULT_APPROVAL_RULES.managerApproveCap),
    staffRefundWindow: raw.staffRefundWindow === 'any' ? 'any' : 'same_day',
    discountPctNeedsApproval: num('discountPctNeedsApproval', DEFAULT_APPROVAL_RULES.discountPctNeedsApproval),
    writeoffCostNeedsApproval: num('writeoffCostNeedsApproval', DEFAULT_APPROVAL_RULES.writeoffCostNeedsApproval),
    expiryMinutes: num('expiryMinutes', DEFAULT_APPROVAL_RULES.expiryMinutes),
    maxPendingPerStaff: num('maxPendingPerStaff', DEFAULT_APPROVAL_RULES.maxPendingPerStaff),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    updatedByName: typeof raw.updatedByName === 'string' ? raw.updatedByName : null,
  }
}
