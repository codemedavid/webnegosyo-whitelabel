/**
 * On-command platform push for "What's New" announcements.
 *
 * Order pushes ring one store from that store's own token table (Convex or
 * `public.push_tokens`). An announcement is a platform message, so it reads
 * ONE table — `public.platform_device_tokens`, written by every signed-in
 * merchant device whatever its order backend — and does the audience filter
 * and the dedupe here, in pure code the route can trust and the tests can
 * see. Reused from the order path: the Expo chunk size and the send URL.
 */

/** A device row as far as recipient selection is concerned. */
export interface PlatformDeviceTokenRow {
  token: string
  user_id: string
  /** The store this device signed into; null for a platform superadmin. */
  tenant_id: string | null
}

/** The slice of an announcement row that decides what a phone reads. */
export interface PushableAnnouncement {
  id: string
  kind: 'post' | 'notice'
  title: string
  summary: string | null
  push_title: string | null
  push_body: string | null
}

export interface AnnouncementPushMessage {
  to: string
  sound: 'default'
  title: string
  body: string
  data: { announcementId: string; kind: 'post' | 'notice' }
}

export const GENERIC_ANNOUNCEMENT_BODY = 'Tap to read what’s new in WebNegosyo.'

/**
 * The devices to reach: every token once, and — when the announcement names
 * an audience — only devices signed into one of those stores. A device with
 * no store (a superadmin's own phone) hears platform-wide posts only.
 */
export function selectAnnouncementRecipients<T extends PlatformDeviceTokenRow>(
  tokens: readonly T[],
  audienceTenantIds: readonly string[] | null
): T[] {
  const audience = audienceTenantIds === null ? null : new Set(audienceTenantIds)
  const seen = new Set<string>()
  const recipients: T[] = []
  for (const row of tokens) {
    if (seen.has(row.token)) continue
    if (audience !== null && (row.tenant_id === null || !audience.has(row.tenant_id))) continue
    seen.add(row.token)
    recipients.push(row)
  }
  return recipients
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** One Expo message per recipient; explicit push copy wins over the post's own. */
export function buildAnnouncementPushMessages(
  tokens: readonly PlatformDeviceTokenRow[],
  announcement: PushableAnnouncement
): AnnouncementPushMessage[] {
  const title = nonEmpty(announcement.push_title) ?? announcement.title
  const body =
    nonEmpty(announcement.push_body) ?? nonEmpty(announcement.summary) ?? GENERIC_ANNOUNCEMENT_BODY

  return tokens.map((row) => ({
    to: row.token,
    sound: 'default',
    title,
    body,
    data: { announcementId: announcement.id, kind: announcement.kind },
  }))
}

/**
 * Ticket and receipt reading lives in `./expo-delivery.ts`, shared with the
 * order path. Re-exported here so the announcement modules (and their tests)
 * keep one import.
 */
export {
  chunkExpoPushMessages,
  describePushFailures,
  staleTokensFrom,
  summarizeFailureCauses,
  summarizePushReceipts,
  summarizePushTickets,
  type PushFailure,
  type PushFailureCause,
  type PushReceiptHandle,
  type PushReceiptSummary,
  type PushTicketSummary,
} from './expo-delivery'
