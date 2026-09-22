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
 * Expo refuses a device in two places, and only one of them is synchronous.
 * A ticket comes straight back from the send and carries the refusals Expo
 * can see itself (a dead device, missing FCM credentials). A *receipt*,
 * fetched afterwards, carries what the push provider said — and that is the
 * only place `MismatchSenderId` ever appears: the build's google-services.json
 * naming a different Firebase project from the FCM key uploaded to EAS drops
 * every Android notification, with a clean ticket for each one. Read both, or
 * a send that reached nobody reports as a send to everyone.
 */

/** One device Expo would not deliver to, from a ticket or from a receipt. */
export interface PushFailure {
  token: string
  /** Expo's machine-readable cause, e.g. 'MismatchSenderId'. Null when it sent none. */
  error: string | null
  message: string | null
}

/** A receipt still to be chased, paired with the device it belongs to. */
export interface PushReceiptHandle {
  id: string
  token: string
}

export interface PushTicketSummary {
  /** Accepted devices, each with the receipt that will say what became of it. */
  receipts: PushReceiptHandle[]
  failures: PushFailure[]
}

interface ExpoOutcome {
  status?: unknown
  id?: unknown
  message?: unknown
  details?: { error?: unknown }
}

function asOutcome(value: unknown): ExpoOutcome | null {
  return typeof value === 'object' && value !== null ? (value as ExpoOutcome) : null
}

function errorCode(outcome: ExpoOutcome): string | null {
  const code = outcome.details?.error
  return typeof code === 'string' ? code : null
}

function errorMessage(outcome: ExpoOutcome): string | null {
  return typeof outcome.message === 'string' ? outcome.message : null
}

const UNREADABLE_TICKET = 'Expo’s reply did not line up with the devices sent'

/**
 * Splits one chunk's tickets into receipts to chase and devices already
 * refused. Tickets come back positionally, one per message; a reply that does
 * not line up is reported as an unknown failure for every device in the chunk
 * rather than guessed at, so it is never mistaken for a delivery and never
 * deletes a live device (only `DeviceNotRegistered` does that).
 */
export function summarizePushTickets(
  messages: readonly { to: string }[],
  tickets: unknown
): PushTicketSummary {
  if (!Array.isArray(tickets) || tickets.length !== messages.length) {
    return {
      receipts: [],
      failures: messages.map((message) => ({
        token: message.to,
        error: null,
        message: UNREADABLE_TICKET,
      })),
    }
  }

  const receipts: PushReceiptHandle[] = []
  const failures: PushFailure[] = []
  tickets.forEach((ticket, index) => {
    const token = messages[index].to
    const outcome = asOutcome(ticket)
    if (!outcome) {
      failures.push({ token, error: null, message: UNREADABLE_TICKET })
      return
    }
    if (outcome.status === 'ok' && typeof outcome.id === 'string') {
      receipts.push({ id: outcome.id, token })
      return
    }
    failures.push({ token, error: errorCode(outcome), message: errorMessage(outcome) })
  })
  return { receipts, failures }
}

export interface PushReceiptSummary {
  failures: PushFailure[]
  /** The receipts that came back — the rest are still pending at Expo. */
  settledIds: string[]
}

/**
 * Reads a `getReceipts` body: a map of receipt id to outcome, holding only the
 * receipts Expo has settled so far. Ids we did not ask about are ignored.
 */
export function summarizePushReceipts(
  receipts: unknown,
  chasing: readonly PushReceiptHandle[]
): PushReceiptSummary {
  const body = asOutcome(receipts) as Record<string, unknown> | null
  if (!body) return { failures: [], settledIds: [] }

  const failures: PushFailure[] = []
  const settledIds: string[] = []
  for (const handle of chasing) {
    const outcome = asOutcome(body[handle.id])
    if (!outcome) continue
    settledIds.push(handle.id)
    if (outcome.status === 'ok') continue
    failures.push({
      token: handle.token,
      error: errorCode(outcome),
      message: errorMessage(outcome),
    })
  }
  return { failures, settledIds }
}

/** The devices to forget: Expo says the app is no longer installed there. */
export function staleTokensFrom(failures: readonly PushFailure[]): string[] {
  const stale = new Set<string>()
  for (const failure of failures) {
    if (failure.error === 'DeviceNotRegistered') stale.add(failure.token)
  }
  return [...stale]
}

export interface PushFailureCause {
  error: string
  count: number
}

/** How many devices each cause accounts for, commonest first. */
export function summarizeFailureCauses(failures: readonly PushFailure[]): PushFailureCause[] {
  const counts = new Map<string, number>()
  for (const failure of failures) {
    const key = failure.error ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
}

/** One line for the operator who just pressed Send, or null if all went out. */
export function describePushFailures(failures: readonly PushFailure[]): string | null {
  if (failures.length === 0) return null
  const causes = summarizeFailureCauses(failures)
    .map((cause) => `${cause.error} ${cause.count}`)
    .join(', ')
  return `${failures.length} failed — ${causes}`
}
