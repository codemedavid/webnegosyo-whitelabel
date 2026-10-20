/**
 * Who hears about a request, and what the push says — pure.
 *
 * Targets: the owner, plus holders of approve_requests who reach the branch
 * and whose limit covers the amount. Never the requester. Content: order
 * number, amount, the staff member's FIRST name and the reason — never
 * customer data (contract). Copy: design-spec §3.12.
 */
import { reasonLabel, declineReasonLabel } from './reasons'
import { approverCapCentavos, isOwnerLike, reachesOutlet, toCentavos } from './rules'
import type { ApprovalActor, ApprovalKind, ApprovalRequestRecord, ApprovalRules } from './types'

/** Requests from the same store within this window are folded into one push. */
export const APPROVAL_BATCH_WINDOW_MS = 2 * 60 * 1000
export const APPROVALS_ANDROID_CHANNEL = 'approvals'

export interface ApproverCandidate extends ApprovalActor {
  displayName: string | null
}

export interface ApprovalPushTarget {
  userId: string
  /** The owner always; a manager only when the amount is within their limit. */
  withinLimit: boolean
}

export function selectApprovalTargets(
  candidates: readonly ApproverCandidate[],
  request: Pick<ApprovalRequestRecord, 'requestedBy' | 'outletId' | 'amount'>,
  rules: ApprovalRules,
): ApprovalPushTarget[] {
  const amount = toCentavos(request.amount)
  const targets: ApprovalPushTarget[] = []
  for (const candidate of candidates) {
    if (candidate.userId === request.requestedBy) continue
    // Platform superadmins are not the store's people; only its own accounts are rung.
    if (candidate.role !== 'admin') continue
    if (!reachesOutlet(candidate, request.outletId)) continue
    const cap = approverCapCentavos(candidate, rules)
    if (cap === -1) continue
    if (cap !== null && amount > cap) continue
    targets.push({ userId: candidate.userId, withinLimit: true })
  }
  return targets
}

/** "₱185", "₱1,450", "₱12.50" — centavos only when there are some. */
export function formatPesoShort(pesos: number): string {
  const hasCentavos = Math.round(pesos * 100) % 100 !== 0
  return `₱${pesos.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: hasCentavos ? 2 : 0,
  })}`
}

export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed.split(/\s+/)[0] : 'Staff'
}

function orderRef(record: Pick<ApprovalRequestRecord, 'orderNumber'>): string {
  return record.orderNumber ? `Order ${record.orderNumber}` : 'an order'
}

function writeoffTitle(record: ApprovalRequestRecord): string {
  const snapshot = record.orderSnapshot ?? {}
  const quantity = typeof snapshot.quantity === 'number' ? snapshot.quantity : null
  const unit = typeof snapshot.unit === 'string' ? ` ${snapshot.unit}` : ''
  const name = typeof snapshot.ingredientName === 'string' ? snapshot.ingredientName : 'stock'
  return `Write off ${quantity !== null ? `${quantity}${unit} ` : ''}${name} · ${formatPesoShort(record.amount)}`
}

export function requestPushTitle(record: ApprovalRequestRecord): string {
  const amount = formatPesoShort(record.amount)
  switch (record.kind) {
    case 'refund':
      return `Refund ${amount} · ${orderRef(record)}`
    case 'cancel_paid':
      return `Cancel paid ${record.orderNumber ? `order ${record.orderNumber}` : 'order'} · ${amount}`
    case 'discount': {
      const pct = typeof record.payload.pct === 'number' ? `${record.payload.pct}% ` : ''
      return `Discount ${pct}· ${orderRef(record)} (−${amount})`
    }
    case 'stock_writeoff':
      return writeoffTitle(record)
  }
}

export interface PushContent {
  title: string
  body: string
  /** iOS/Android action set registered by the app (design-spec §3.12). */
  categoryId?: 'approval_within_limit' | 'approval_over_limit' | 'approval_result'
  data: Record<string, string>
}

export function buildRequestPush(
  record: ApprovalRequestRecord,
  target: ApprovalPushTarget,
  rules: ApprovalRules,
): PushContent {
  const overManager = toCentavos(record.amount) > toCentavos(rules.managerApproveCap)
  const reason = reasonLabel(record.kind, record.reasonCode)
  return {
    title: requestPushTitle(record),
    body: `${firstName(record.requestedByName)}: ${reason}${
      overManager ? ` · over the ${formatPesoShort(rules.managerApproveCap)} manager limit` : ''
    }`,
    categoryId: target.withinLimit ? 'approval_within_limit' : 'approval_over_limit',
    data: { type: 'approval_request', approvalId: record.id, tenantId: record.tenantId },
  }
}

/** ≥2 waiting within the batch window: one summary push, no actions (never bulk-approve blind). */
export function buildBatchedPush(
  tenantId: string,
  waiting: readonly Pick<ApprovalRequestRecord, 'amount' | 'requestedByName' | 'kind'>[],
): PushContent {
  const total = waiting.reduce((sum, request) => sum + toCentavos(request.kind === 'stock_writeoff' ? 0 : request.amount), 0)
  const names = Array.from(new Set(waiting.map((request) => firstName(request.requestedByName)))).slice(0, 3)
  return {
    title: `${waiting.length} requests waiting${total > 0 ? ` · ${formatPesoShort(total / 100)}` : ''}`,
    body: `${names.join(', ')} · tap to review`,
    data: { type: 'approval_batch', tenantId },
  }
}

const KIND_NOUN: Readonly<Record<ApprovalKind, string>> = {
  refund: 'refund',
  cancel_paid: 'cancel',
  discount: 'discount',
  stock_writeoff: 'write-off',
}

/** The answer, to the requester. Null = nothing worth a push. */
export function buildResultPush(record: ApprovalRequestRecord, expiryMinutes: number): PushContent | null {
  const noun = KIND_NOUN[record.kind]
  const on = record.orderNumber ? ` on ${record.orderNumber}` : ''
  const decider = firstName(record.decidedByName)
  const data = { type: 'approval_result', approvalId: record.id, tenantId: record.tenantId }
  const amount = formatPesoShort(record.approvedAmount ?? record.amount)
  switch (record.status) {
    case 'executed':
      return {
        title: `Approved: ${noun} ${amount}${on}`,
        body:
          record.kind === 'refund' || record.kind === 'cancel_paid'
            ? `${decider} said yes. Give it back from your drawer.`
            : `${decider} said yes.`,
        categoryId: 'approval_result',
        data,
      }
    case 'declined':
      return {
        title: `Not approved: ${noun}${on}`,
        body: `${decider}: ${declineReasonLabel(record.decisionReasonCode ?? '')}`,
        categoryId: 'approval_result',
        data,
      }
    case 'expired':
      return {
        title: `No answer: ${noun}${on}`,
        body: `The request closed after ${expiryMinutes} min. You can ask again.`,
        categoryId: 'approval_result',
        data,
      }
    case 'failed':
      return {
        title: `Couldn't finish: ${noun}${on}`,
        body: record.error ?? 'Nothing was changed. You can ask again.',
        categoryId: 'approval_result',
        data,
      }
    default:
      return null
  }
}

export interface DeviceToken {
  token: string
  userId: string
  platform: string
  channels: readonly string[] | null
}

export interface ExpoApprovalMessage {
  to: string
  title: string
  body: string
  data: Record<string, string>
  sound: 'default'
  priority: 'high'
  categoryId?: string
  channelId?: string
  interruptionLevel?: 'time-sensitive' | 'active'
}

/** Android gets channelId 'approvals' ONLY when that install created it; else the default channel. */
export function toExpoMessage(token: DeviceToken, content: PushContent, urgent: boolean): ExpoApprovalMessage {
  const hasChannel = token.platform === 'android' && (token.channels ?? []).includes(APPROVALS_ANDROID_CHANNEL)
  return {
    to: token.token,
    title: content.title,
    body: content.body,
    data: content.data,
    sound: 'default',
    priority: 'high',
    ...(content.categoryId ? { categoryId: content.categoryId } : {}),
    ...(hasChannel && urgent ? { channelId: APPROVALS_ANDROID_CHANNEL } : {}),
    interruptionLevel: urgent ? 'time-sensitive' : 'active',
  }
}

/** Owners/approvers only (for the "Who will be asked" callout). */
export function approverFirstNames(
  candidates: readonly ApproverCandidate[],
  targets: readonly ApprovalPushTarget[],
): string[] {
  const byId = new Map(candidates.map((candidate) => [candidate.userId, candidate]))
  return targets
    .map((target) => byId.get(target.userId))
    .filter((candidate): candidate is ApproverCandidate => candidate !== undefined)
    .sort((a, b) => Number(isOwnerLike(a)) - Number(isOwnerLike(b)))
    .map((candidate) => firstName(candidate.displayName))
}
