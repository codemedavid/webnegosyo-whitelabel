/**
 * Delivering approval notifications.
 *
 * Behind a small interface on purpose: another session is building the
 * merchant bell inbox (`merchant_notifications` + /api/push/notify-merchant).
 * When it lands, a second ApprovalNotifier writes the inbox row and the Expo
 * one below keeps ringing the phone — callers do not change. Until then this
 * sends Expo pushes straight to the people's platform_device_tokens.
 */
import { chaseExpoReceipts, sendExpoPushMessages, staleTokensFrom, summarizeFailureCauses, type FetchLike } from '@/lib/push/expo-delivery'
import {
  APPROVAL_BATCH_WINDOW_MS,
  buildBatchedPush,
  buildRequestPush,
  buildResultPush,
  selectApprovalTargets,
  toExpoMessage,
  type ApprovalPushTarget,
  type PushContent,
} from './push'
import {
  deleteDeviceTokens,
  listApproverCandidates,
  listDeviceTokens,
  listRecentPending,
  type ApprovalsDb,
} from './repository'
import { reachesOutlet } from './rules'
import type { ApprovalRequestRecord, ApprovalRules } from './types'

export interface ApprovalNotice {
  tenantId: string
  requestId: string
  /** Per recipient: what they read. */
  recipients: { userId: string; content: PushContent; urgent: boolean }[]
}

export interface DeliveryReport {
  recipients: number
  devices: number
  accepted: number
  refused: number
  staleRemoved: number
}

export interface ApprovalNotifier {
  deliver(notice: ApprovalNotice): Promise<DeliveryReport>
}

export function createExpoApprovalNotifier(db: ApprovalsDb, options: { fetchImpl?: FetchLike } = {}): ApprovalNotifier {
  return {
    async deliver(notice) {
      const userIds = notice.recipients.map((recipient) => recipient.userId)
      const tokens = await listDeviceTokens(db, notice.tenantId, userIds)
      const byUser = new Map(notice.recipients.map((recipient) => [recipient.userId, recipient]))
      const messages = tokens.flatMap((token) => {
        const recipient = byUser.get(token.userId)
        return recipient ? [toExpoMessage(token, recipient.content, recipient.urgent)] : []
      })
      if (messages.length === 0) {
        return { recipients: notice.recipients.length, devices: 0, accepted: 0, refused: 0, staleRemoved: 0 }
      }
      const sent = await sendExpoPushMessages(messages, { fetchImpl: options.fetchImpl })
      const receipts = await chaseExpoReceipts(sent.accepted, { fetchImpl: options.fetchImpl })
      const failures = [...sent.failures, ...receipts.failures]
      const stale = staleTokensFrom(failures)
      await deleteDeviceTokens(db, stale)
      if (failures.length > 0) console.error('[approvals] push refusals', summarizeFailureCauses(failures))
      return {
        recipients: notice.recipients.length,
        devices: messages.length,
        accepted: sent.accepted.length - receipts.failures.length,
        refused: failures.length,
        staleRemoved: stale.length,
      }
    },
  }
}

/**
 * A new pending request: ring everyone who can answer it. If the same person
 * already has other requests from this store waiting from the last 2 minutes,
 * they get ONE summary instead of a stack of pushes.
 */
export async function notifyApprovers(
  db: ApprovalsDb,
  notifier: ApprovalNotifier,
  record: ApprovalRequestRecord,
  rules: ApprovalRules,
  now: Date,
): Promise<{ targets: ApprovalPushTarget[]; report: DeliveryReport | null }> {
  const candidates = await listApproverCandidates(db, record.tenantId)
  const targets = selectApprovalTargets(candidates, record, rules)
  if (targets.length === 0) return { targets, report: null }

  const recent = await listRecentPending(db, record.tenantId, new Date(now.getTime() - APPROVAL_BATCH_WINDOW_MS).toISOString())
  const candidateById = new Map(candidates.map((candidate) => [candidate.userId, candidate]))

  const recipients = targets.map((target) => {
    const viewer = candidateById.get(target.userId)
    const waiting = recent
      .filter((row) => row.requested_by !== target.userId)
      .filter((row) => (viewer ? reachesOutlet(viewer, typeof row.outlet_id === 'string' ? row.outlet_id : null) : false))
      .map((row) => ({
        amount: Number(row.amount ?? 0),
        requestedByName: typeof row.requested_by_name === 'string' ? row.requested_by_name : null,
        kind: row.kind as ApprovalRequestRecord['kind'],
      }))
    const content = waiting.length >= 2 ? buildBatchedPush(record.tenantId, waiting) : buildRequestPush(record, target, rules)
    return { userId: target.userId, content, urgent: true }
  })

  const report = await notifier.deliver({ tenantId: record.tenantId, requestId: record.id, recipients })
  return { targets, report }
}

/** The answer, to the person who asked (approved / declined / expired / failed). */
export async function notifyRequester(
  notifier: ApprovalNotifier,
  record: ApprovalRequestRecord,
  rules: ApprovalRules,
): Promise<DeliveryReport | null> {
  if (record.isDirect) return null
  const content = buildResultPush(record, rules.expiryMinutes)
  if (!content) return null
  return notifier.deliver({
    tenantId: record.tenantId,
    requestId: record.id,
    recipients: [{ userId: record.requestedBy, content, urgent: false }],
  })
}
