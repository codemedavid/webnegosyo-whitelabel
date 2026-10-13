/**
 * The approvals routes' envelope: { success, data, error, code } — always the
 * same shape, never cached. Pure (no server imports) so it is testable.
 */

export interface ApprovalsEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
  code?: string
}

export interface ApprovalsReply<T = unknown> {
  status: number
  body: ApprovalsEnvelope<T>
}

export function okReply<T>(data: T, status = 200): ApprovalsReply<T> {
  return { status, body: { success: true, data, error: null } }
}

export function failReply<T = never>(status: number, error: string, code?: string, data: T | null = null): ApprovalsReply<T> {
  return { status, body: { success: false, data, error, ...(code ? { code } : {}) } }
}

/** SQL refusal codes → HTTP status. Unknown codes are a 409 (the state said no). */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  not_found: 404,
  order_not_found: 404,
  forbidden: 403,
  self_approval: 403,
  not_approver: 403,
  not_requester: 403,
  over_limit: 403,
  other_branch: 403,
  direct_not_allowed: 403,
  statutory_not_gated: 422,
  invalid_payload: 422,
  invalid_lines: 422,
  reason_required: 422,
  empty_order: 422,
  nothing_to_refund: 422,
  over_refund: 422,
  amount_override_not_allowed: 422,
  amount_override_too_high: 422,
  invalid_transition: 422,
  no_open_shift: 409,
  too_many_pending: 409,
  already_open: 409,
  not_pending: 409,
  expired: 409,
  withdrawn: 409,
  order_changed: 409,
  order_cancelled: 409,
  backend_unsupported: 409,
  execution_error: 500,
}

export function statusForCode(code: string): number {
  return STATUS_BY_CODE[code] ?? 409
}
