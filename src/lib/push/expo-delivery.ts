/**
 * Talking to Expo's push service — and, more importantly, reading what it
 * says back.
 *
 * Expo refuses a device in two places, and only one of them is synchronous.
 * A **ticket** comes straight back from the send and carries the refusals Expo
 * can see itself (a dead device, missing FCM credentials). A **receipt**,
 * fetched afterwards, carries what the push provider said — and that is the
 * only place `MismatchSenderId` ever appears: a build whose
 * `google-services.json` names a different Firebase project from the FCM key
 * uploaded to EAS drops EVERY Android notification, with a clean ticket for
 * each one. That exact mismatch silenced every Android merchant device on this
 * platform while both send paths reported a clean send, because neither read
 * the reply at all.
 *
 * So: read both, or a send that reached nobody reports as a send to everyone.
 * Shared by the order path (`api/push/notify-order`) and the announcement path
 * (`send-announcement.ts`) so one fix covers both.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

/** The Expo push API accepts at most this many messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100

/**
 * Expo settles most receipts within seconds, so a short bounded chase catches
 * a platform-wide refusal while the caller is still around to report it.
 * Anything still open after this is reported as pending, never as delivered.
 */
export const RECEIPT_POLL_ATTEMPTS = 3
export const RECEIPT_POLL_DELAY_MS = 1500

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>
export type SleepLike = (ms: number) => Promise<void>

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

/** Batches sized for the Expo push API. */
export function chunkExpoPushMessages<T>(messages: readonly T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE))
  }
  return chunks
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

/** One line for whoever is watching — an operator, or a server log. */
export function describePushFailures(failures: readonly PushFailure[]): string | null {
  if (failures.length === 0) return null
  const causes = summarizeFailureCauses(failures)
    .map((cause) => `${cause.error} ${cause.count}`)
    .join(', ')
  return `${failures.length} failed — ${causes}`
}

async function postJson(fetchImpl: FetchLike, url: string, body: unknown): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Expo responded ${response.status}`)
  const json = (await response.json()) as { data?: unknown }
  return json.data
}

export interface ExpoSendResult {
  /** Devices Expo accepted, each with the receipt that says what became of it. */
  accepted: PushReceiptHandle[]
  /** Devices refused at ticket time. */
  failures: PushFailure[]
  /** Chunks whose HTTP call failed outright — those devices are unaccounted for. */
  failedChunks: number
}

/**
 * Posts every message in chunks and reads the tickets. A chunk that fails at
 * the HTTP level is counted, not thrown: one bad batch must not stop the rest
 * of the devices from being rung.
 */
export async function sendExpoPushMessages(
  messages: readonly { to: string }[],
  options: { fetchImpl?: FetchLike } = {}
): Promise<ExpoSendResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as FetchLike)
  const accepted: PushReceiptHandle[] = []
  const failures: PushFailure[] = []
  let failedChunks = 0

  for (const chunk of chunkExpoPushMessages(messages)) {
    try {
      const tickets = await postJson(fetchImpl, EXPO_PUSH_URL, chunk)
      const summary = summarizePushTickets(chunk, tickets)
      accepted.push(...summary.receipts)
      failures.push(...summary.failures)
    } catch (chunkError) {
      failedChunks += 1
      console.error('[expo-push] chunk failed:', chunkError)
    }
  }

  return { accepted, failures, failedChunks }
}

export interface ExpoReceiptResult {
  failures: PushFailure[]
  /** Devices whose receipt had not settled before we stopped waiting. */
  pending: number
}

/**
 * Chases the receipts for accepted devices until they settle or we run out of
 * attempts. This is where a platform-wide Android refusal surfaces, so it is
 * never skipped just because every ticket came back clean.
 */
export async function chaseExpoReceipts(
  accepted: readonly PushReceiptHandle[],
  options: {
    fetchImpl?: FetchLike
    sleep?: SleepLike
    attempts?: number
    delayMs?: number
  } = {}
): Promise<ExpoReceiptResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as FetchLike)
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const attempts = options.attempts ?? RECEIPT_POLL_ATTEMPTS
  const delayMs = options.delayMs ?? RECEIPT_POLL_DELAY_MS

  let outstanding = [...accepted]
  const failures: PushFailure[] = []

  for (let attempt = 0; attempt < attempts && outstanding.length > 0; attempt += 1) {
    await sleep(delayMs)
    const settled = new Set<string>()
    for (const chunk of chunkExpoPushMessages(outstanding)) {
      try {
        const body = await postJson(fetchImpl, EXPO_RECEIPTS_URL, {
          ids: chunk.map((handle) => handle.id),
        })
        const summary = summarizePushReceipts(body, chunk)
        failures.push(...summary.failures)
        summary.settledIds.forEach((id) => settled.add(id))
      } catch (receiptError) {
        console.error('[expo-push] receipt lookup failed:', receiptError)
      }
    }
    outstanding = outstanding.filter((handle) => !settled.has(handle.id))
  }

  return { failures, pending: outstanding.length }
}
