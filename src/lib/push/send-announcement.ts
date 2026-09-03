/**
 * Sends one announcement to every eligible merchant device and records the
 * outcome on the row. The pure recipient/message rules live in
 * `announcement-push.ts`; this module owns the I/O: read tokens, POST to
 * Expo in chunks, drop tokens Expo says are dead, stamp the send.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { chunkExpoPushMessages } from './order-push'
import {
  buildAnnouncementPushMessages,
  collectStalePushTokens,
  selectAnnouncementRecipients,
  type PlatformDeviceTokenRow,
  type PushableAnnouncement,
} from './announcement-push'

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type Client = SupabaseClient<Database>
type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface AnnouncementSendResult {
  recipientCount: number
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

async function postChunk(fetchImpl: FetchLike, chunk: { to: string }[]): Promise<unknown> {
  const response = await fetchImpl(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(chunk),
  })
  if (!response.ok) throw new Error(`Expo push responded ${response.status}`)
  const json = (await response.json()) as { data?: unknown }
  return json.data
}

export async function sendAnnouncementPush(
  client: Client,
  announcementId: string,
  fetchImpl: FetchLike = fetch
): Promise<AnnouncementSendResult> {
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

  const stale: string[] = []
  let failedChunks = 0
  for (const chunk of chunkExpoPushMessages(messages)) {
    try {
      const tickets = await postChunk(fetchImpl, chunk)
      stale.push(...collectStalePushTokens(chunk, tickets))
    } catch (chunkError) {
      failedChunks += 1
      console.error('[announcement-push] chunk failed:', chunkError)
    }
  }

  if (stale.length > 0) {
    const { error: deleteError } = await client
      .from('platform_device_tokens')
      .delete()
      .in('token', stale)
    if (deleteError) console.error('[announcement-push] stale cleanup failed:', deleteError.message)
  }

  const { error: stampError } = await client
    .from('platform_announcements')
    .update({ push_sent_at: new Date().toISOString(), push_recipient_count: messages.length })
    .eq('id', announcementId)
  if (stampError) throw new Error(`Sent, but failed to record the send: ${stampError.message}`)

  return { recipientCount: messages.length, staleTokensRemoved: stale.length, failedChunks }
}
