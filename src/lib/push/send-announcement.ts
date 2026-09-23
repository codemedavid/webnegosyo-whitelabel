/**
 * Sends one announcement to every eligible merchant device and records the
 * outcome on the row. The pure recipient/outcome rules live in
 * `announcement-push.ts`; this module owns the I/O: read tokens, POST to Expo
 * in chunks, chase the receipts, drop tokens Expo says are dead, stamp the
 * send.
 *
 * Receipts are chased rather than assumed because a ticket only proves Expo
 * accepted the message. Whether the push provider delivered it shows up in the
 * receipt — and a whole platform can fail there (see `MismatchSenderId`) while
 * every ticket comes back clean.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  buildAnnouncementPushMessages,
  selectAnnouncementRecipients,
  type PlatformDeviceTokenRow,
  type PushableAnnouncement,
} from './announcement-push'
import {
  chaseExpoReceipts,
  sendExpoPushMessages,
  staleTokensFrom,
  summarizeFailureCauses,
  type FetchLike,
  type PushFailure,
  type PushFailureCause,
  type SleepLike,
} from './expo-delivery'

// Re-exported: the send URLs and the receipt-chase budget are shared with the
// order path but named here by the announcement tests and callers.
export {
  EXPO_PUSH_URL,
  EXPO_RECEIPTS_URL,
  RECEIPT_POLL_ATTEMPTS,
  RECEIPT_POLL_DELAY_MS,
} from './expo-delivery'

type Client = SupabaseClient<Database>

export interface AnnouncementSendOptions {
  fetchImpl?: FetchLike
  sleep?: SleepLike
}

export interface AnnouncementSendResult {
  /** Devices we tried to reach. */
  recipientCount: number
  /** Devices Expo accepted a message for. */
  acceptedCount: number
  /** Devices a receipt confirms the push provider took. */
  deliveredCount: number
  /** Devices whose receipt had not settled before we stopped waiting. */
  pendingCount: number
  /** Every refusal, from tickets and receipts alike, grouped by cause. */
  failureCauses: PushFailureCause[]
  failureCount: number
  staleTokensRemoved: number
  failedChunks: number
}

interface SendableRow extends PushableAnnouncement {
  status: string
  audience_tenant_ids: string[] | null
}

/** How many devices a send would reach right now, for the confirm dialog. */
export async function countAnnouncementRecipients(
  client: Client,
  audienceTenantIds: string[] | null
): Promise<number> {
  const { data, error } = await client
    .from('platform_device_tokens')
    .select('token, user_id, tenant_id')
  if (error) throw new Error(`Failed to count devices: ${error.message}`)
  return selectAnnouncementRecipients((data ?? []) as PlatformDeviceTokenRow[], audienceTenantIds)
    .length
}

export async function sendAnnouncementPush(
  client: Client,
  announcementId: string,
  options: AnnouncementSendOptions = {}
): Promise<AnnouncementSendResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as FetchLike)
  const sleep = options.sleep

  const { data: row, error } = await client
    .from('platform_announcements')
    .select('id, kind, title, summary, push_title, push_body, status, audience_tenant_ids')
    .eq('id', announcementId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load announcement: ${error.message}`)
  if (!row) throw new Error('Announcement not found')
  const announcement = row as SendableRow
  if (announcement.status !== 'published') {
    throw new Error('Publish the announcement before sending a notification')
  }

  const { data: tokens, error: tokensError } = await client
    .from('platform_device_tokens')
    .select('token, user_id, tenant_id')
  if (tokensError) throw new Error(`Failed to load devices: ${tokensError.message}`)

  const recipients = selectAnnouncementRecipients(
    (tokens ?? []) as PlatformDeviceTokenRow[],
    announcement.audience_tenant_ids
  )
  const messages = buildAnnouncementPushMessages(recipients, {
    id: announcement.id,
    kind: announcement.kind === 'notice' ? 'notice' : 'post',
    title: announcement.title,
    summary: announcement.summary,
    push_title: announcement.push_title,
    push_body: announcement.push_body,
  })

  const sendResult = await sendExpoPushMessages(messages, { fetchImpl })
  const { accepted, failedChunks } = sendResult
  const failures: PushFailure[] = [...sendResult.failures]

  const receipts = await chaseExpoReceipts(accepted, { fetchImpl, sleep })
  failures.push(...receipts.failures)

  const stale = staleTokensFrom(failures)
  if (stale.length > 0) {
    const { error: deleteError } = await client
      .from('platform_device_tokens')
      .delete()
      .in('token', stale)
    if (deleteError) console.error('[announcement-push] stale cleanup failed:', deleteError.message)
  }

  const deliveredCount = accepted.length - receipts.failures.length - receipts.pending
  if (failures.length > 0) {
    console.error('[announcement-push] refusals:', summarizeFailureCauses(failures))
  }

  // The stored count excludes every device we KNOW was refused, and still
  // counts the ones whose receipt had not settled — counting refusals as
  // recipients is what let a platform-wide failure read as a clean send.
  const notRefusedCount = deliveredCount + receipts.pending
  const { error: stampError } = await client
    .from('platform_announcements')
    .update({ push_sent_at: new Date().toISOString(), push_recipient_count: notRefusedCount })
    .eq('id', announcementId)
  if (stampError) throw new Error(`Sent, but failed to record the send: ${stampError.message}`)

  return {
    recipientCount: messages.length,
    acceptedCount: accepted.length,
    deliveredCount,
    pendingCount: receipts.pending,
    failureCauses: summarizeFailureCauses(failures),
    failureCount: failures.length,
    staleTokensRemoved: stale.length,
    failedChunks,
  }
}
