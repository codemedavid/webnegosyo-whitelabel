/**
 * The approvals use cases behind the routes. The routes authenticate, parse
 * and rate-limit; this decides and calls the database. Everything that
 * touches money happens inside the SQL functions — here we only choose WHICH
 * function (direct vs pending), shape the answer, and schedule the
 * after-the-fact work (pushes, stock, loyalty) so the response never waits.
 */
import { canViewRequest, sortForInbox, toApprovalRecord, toApprovalView } from './dto'
import { runApprovalSideEffects, type SideEffectDeps } from './execute'
import { failReply, okReply, statusForCode, type ApprovalsReply } from './http'
import { notifyApprovers, notifyRequester, type ApprovalNotifier } from './notifier'
import { approverFirstNames, selectApprovalTargets } from './push'
import { reasonLabel } from './reasons'
import {
  createAndExecuteDirect,
  createPendingRequest,
  decideRequest,
  expireDue,
  getRequestRow,
  listApproverCandidates,
  listRequests,
  loadRules,
  loadTenantBackend,
  quoteRequest,
  recordSideEffects,
  saveRules,
  withdrawRequest,
  type ApprovalsDb,
  type RpcOutcome,
} from './repository'
import { canApproveAtAll, checkCanDecide, decideRoute, isOwnerLike, toCentavos } from './rules'
import type { CreateApprovalBody, DecisionBody, RulesUpdateBody } from './schemas'
import type { ApprovalActor, ApprovalRequestRecord, ApprovalRequestView, ApprovalRules } from './types'

export const BACKEND_UNSUPPORTED_MESSAGE = 'Refunds for this store type are coming soon.'
/** "Done today" window for approvers. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

export interface ApprovalsContext {
  db: ApprovalsDb
  actor: ApprovalActor
  tenantId: string
  now: Date
  notifier: ApprovalNotifier
  /** Runs work after the response (next/server `after` in production). */
  schedule: (work: () => Promise<void>) => void
  sideEffectDeps: () => Promise<SideEffectDeps>
}

function refusalReply(outcome: RpcOutcome, ctx: ApprovalsContext, rules: ApprovalRules): ApprovalsReply {
  const code = typeof outcome.code === 'string' ? outcome.code : 'refused'
  const message = typeof outcome.message === 'string' ? outcome.message : 'That could not be done.'
  const row = outcome.request && typeof outcome.request === 'object' ? (outcome.request as Record<string, unknown>) : null
  const data = row ? { request: toApprovalView(ctx.actor, toApprovalRecord(row), rules, ctx.now) } : null
  return failReply(statusForCode(code), message, code, data)
}

function recordFrom(outcome: RpcOutcome): ApprovalRequestRecord | null {
  const row = outcome.request
  return row && typeof row === 'object' ? toApprovalRecord(row as Record<string, unknown>) : null
}

/** After an execution: stock / pre-sell / loyalty / status log, then the report onto the row. */
function scheduleSideEffects(ctx: ApprovalsContext, record: ApprovalRequestRecord): void {
  if (record.status !== 'executed' || (record.kind !== 'refund' && record.kind !== 'cancel_paid')) return
  ctx.schedule(async () => {
    const report = await runApprovalSideEffects(record, await ctx.sideEffectDeps())
    if (report) await recordSideEffects(ctx.db, record.tenantId, record.id, { ...report })
  })
}

function scheduleRequesterNotice(ctx: ApprovalsContext, record: ApprovalRequestRecord, rules: ApprovalRules): void {
  ctx.schedule(async () => {
    try {
      await notifyRequester(ctx.notifier, record, rules)
    } catch (error) {
      console.error('[approvals] requester push failed', { requestId: record.id, error })
    }
  })
}

async function storeSupportsOrders(ctx: ApprovalsContext): Promise<boolean> {
  return (await loadTenantBackend(ctx.db, ctx.tenantId)) === 'platform'
}

export async function createApproval(ctx: ApprovalsContext, body: CreateApprovalBody): Promise<ApprovalsReply> {
  if (body.kind !== 'stock_writeoff' && !(await storeSupportsOrders(ctx))) {
    return failReply(409, BACKEND_UNSUPPORTED_MESSAGE, 'backend_unsupported')
  }
  if (body.kind === 'discount' && body.payload.statutory) {
    return failReply(422, 'Senior and PWD discounts never need approval. Apply them at the register.', 'statutory_not_gated')
  }

  const rules = await loadRules(ctx.db, ctx.tenantId)
  const orderId = body.kind === 'stock_writeoff' ? null : body.orderId
  const payload: Record<string, unknown> = { ...body.payload, reasonLabel: reasonLabel(body.kind, body.reasonCode) }
  const args = { tenantId: ctx.tenantId, userId: ctx.actor.userId, kind: body.kind, orderId, payload }

  const quote = await quoteRequest(ctx.db, args)
  if (!quote.ok) return refusalReply(quote, ctx, rules)

  const orderCreatedAt = typeof quote.orderCreatedAt === 'string' ? new Date(quote.orderCreatedAt) : null
  const route = decideRoute({
    actor: ctx.actor,
    kind: body.kind,
    amountCentavos: toCentavos(Number(quote.amount)),
    rules,
    now: ctx.now,
    orderCreatedAt,
    // The database's own percent (amountOff ÷ order total), never the client's claim.
    discountPct: body.kind === 'discount' && quote.pct !== undefined && quote.pct !== null ? Number(quote.pct) : null,
  })
  if (route.route === 'refused') return failReply(statusForCode(route.code), route.message, route.code)

  const createArgs = { ...args, reasonCode: body.reasonCode, note: body.note ?? null, idempotencyKey: body.idempotencyKey }
  const outcome = route.route === 'direct'
    ? await createAndExecuteDirect(ctx.db, createArgs)
    : await createPendingRequest(ctx.db, createArgs)
  if (!outcome.ok) return refusalReply(outcome, ctx, rules)

  const record = recordFrom(outcome)
  if (!record) return failReply(500, 'The request was saved but could not be read back.', 'execution_error')
  const isReplay = outcome.replayed === true

  let approvers: string[] = []
  if (record.status === 'pending') {
    const candidates = await listApproverCandidates(ctx.db, ctx.tenantId)
    approvers = approverFirstNames(candidates, selectApprovalTargets(candidates, record, rules))
    if (!isReplay) {
      ctx.schedule(async () => {
        try {
          await notifyApprovers(ctx.db, ctx.notifier, record, rules, ctx.now)
        } catch (error) {
          console.error('[approvals] approver push failed', { requestId: record.id, error })
        }
      })
    }
  } else if (!isReplay) {
    scheduleSideEffects(ctx, record)
  }

  return okReply(
    { route: route.route, replayed: isReplay, approvers, request: toApprovalView(ctx.actor, record, rules, ctx.now) },
    isReplay ? 200 : 201,
  )
}

async function loadVisible(ctx: ApprovalsContext, id: string, rules: ApprovalRules): Promise<ApprovalRequestRecord | null> {
  const row = await getRequestRow(ctx.db, ctx.tenantId, id)
  if (!row) return null
  const record = toApprovalRecord(row)
  // Someone who may not see it gets the same answer as for one that does not exist.
  return canViewRequest(ctx.actor, record, rules) ? record : null
}

export async function decideApproval(ctx: ApprovalsContext, id: string, body: DecisionBody): Promise<ApprovalsReply> {
  await expireDue(ctx.db, ctx.tenantId)
  const rules = await loadRules(ctx.db, ctx.tenantId)
  const record = await loadVisible(ctx, id, rules)
  if (!record) return failReply(404, 'This request could not be found.', 'not_found')

  const check = checkCanDecide({
    approver: ctx.actor,
    requestedBy: record.requestedBy,
    outletId: record.outletId,
    amountCentavos: toCentavos(body.amountOverride ?? record.amount),
    rules,
  })
  if (!check.ok && record.status === 'pending') {
    const message = {
      self_approval: 'You cannot answer your own request.',
      not_approver: 'Your account cannot answer requests. Ask the owner for "Approve requests".',
      over_limit: 'Over your limit. The owner has been asked.',
      other_branch: 'This request is for another branch.',
    }[check.code]
    return failReply(403, message, check.code)
  }

  const outcome = await decideRequest(ctx.db, {
    tenantId: ctx.tenantId,
    requestId: id,
    actorId: ctx.actor.userId,
    decision: body.decision,
    reasonCode: body.reasonCode ?? null,
    note: body.note ?? null,
    amountOverride: body.amountOverride ?? null,
  })
  const finished = recordFrom(outcome)
  if (finished && (finished.status === 'executed' || finished.status === 'failed' || finished.status === 'declined')) {
    scheduleSideEffects(ctx, finished)
    scheduleRequesterNotice(ctx, finished, rules)
  }
  if (!outcome.ok) {
    // An execution that failed after the approval is still an answer: the row says why.
    if (finished?.status === 'failed') {
      return okReply({ request: toApprovalView(ctx.actor, finished, rules, ctx.now) })
    }
    return refusalReply(outcome, ctx, rules)
  }
  if (!finished) return failReply(500, 'The decision was saved but could not be read back.', 'execution_error')
  return okReply({ request: toApprovalView(ctx.actor, finished, rules, ctx.now) })
}

export async function withdrawApproval(ctx: ApprovalsContext, id: string): Promise<ApprovalsReply> {
  const rules = await loadRules(ctx.db, ctx.tenantId)
  const record = await loadVisible(ctx, id, rules)
  if (!record) return failReply(404, 'This request could not be found.', 'not_found')
  if (record.requestedBy !== ctx.actor.userId) {
    return failReply(403, 'Only the person who asked can withdraw this request.', 'not_requester')
  }
  const outcome = await withdrawRequest(ctx.db, ctx.tenantId, id, ctx.actor.userId)
  if (!outcome.ok) return refusalReply(outcome, ctx, rules)
  const updated = recordFrom(outcome)
  if (!updated) return failReply(500, 'Withdrawn, but the request could not be read back.', 'execution_error')
  return okReply({ request: toApprovalView(ctx.actor, updated, rules, ctx.now) })
}

export async function getApproval(ctx: ApprovalsContext, id: string): Promise<ApprovalsReply> {
  await expireDue(ctx.db, ctx.tenantId)
  const rules = await loadRules(ctx.db, ctx.tenantId)
  const record = await loadVisible(ctx, id, rules)
  if (!record) return failReply(404, 'This request could not be found.', 'not_found')
  return okReply({ request: toApprovalView(ctx.actor, record, rules, ctx.now) })
}

export async function listApprovals(
  ctx: ApprovalsContext,
  status: 'pending' | 'mine' | 'recent',
): Promise<ApprovalsReply<{ requests: ApprovalRequestView[]; isApprover: boolean }>> {
  await expireDue(ctx.db, ctx.tenantId)
  const rules = await loadRules(ctx.db, ctx.tenantId)
  const isApprover = canApproveAtAll(ctx.actor, rules)
  const since = new Date(ctx.now.getTime() - RECENT_WINDOW_MS).toISOString()

  const rows =
    status === 'mine'
      ? await listRequests(ctx.db, ctx.tenantId, { kind: 'mine', userId: ctx.actor.userId })
      : status === 'pending'
        ? await listRequests(ctx.db, ctx.tenantId, { kind: 'pending' })
        : isApprover
          ? await listRequests(ctx.db, ctx.tenantId, { kind: 'recent', sinceIso: since })
          : await listRequests(ctx.db, ctx.tenantId, { kind: 'recent_mine', userId: ctx.actor.userId, sinceIso: since })

  const views = rows
    .map(toApprovalRecord)
    .filter((record) => (isApprover ? canViewRequest(ctx.actor, record, rules) : record.requestedBy === ctx.actor.userId))
    .map((record) => toApprovalView(ctx.actor, record, rules, ctx.now))
    .filter((view) => status !== 'pending' || view.status === 'pending')

  return okReply({ requests: status === 'pending' ? sortForInbox(views) : views, isApprover })
}

export async function getApprovalRules(ctx: ApprovalsContext): Promise<ApprovalsReply> {
  const rules = await loadRules(ctx.db, ctx.tenantId)
  const candidates = await listApproverCandidates(ctx.db, ctx.tenantId)
  const approvers = candidates
    .filter((candidate) => !isOwnerLike(candidate) && canApproveAtAll(candidate, rules))
    .map((candidate) => ({ userId: candidate.userId, name: candidate.displayName, outletId: candidate.outletId }))
  return okReply({ rules, approvers, canEdit: isOwnerLike(ctx.actor) })
}

export async function updateApprovalRules(ctx: ApprovalsContext, body: RulesUpdateBody): Promise<ApprovalsReply> {
  if (!isOwnerLike(ctx.actor)) return failReply(403, 'Only the owner can change approval rules.', 'forbidden')
  const changes = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'tenantId'))
  const outcome = await saveRules(ctx.db, ctx.tenantId, ctx.actor.userId, changes)
  if (!outcome.ok) {
    return failReply(statusForCode(String(outcome.code)), String(outcome.message ?? 'Rules could not be saved.'), String(outcome.code))
  }
  return okReply({ rules: outcome.rules })
}
