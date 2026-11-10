/**
 * The one way the automations talk to Meta's Send API.
 *
 * Every message is inside the customer's 24h window: a `RESPONSE` to something
 * they just did, or an `UPDATE` (an order status message, sent only while the
 * window is open — `order-view.ts`). Each carries `metadata: "wn"`, so
 * its echo is recognisable as ours. Errors are logged once with Meta's code,
 * never with the PSID or the page token.
 */

import 'server-only'
import { FACEBOOK_GRAPH_API } from '@/lib/facebook/graph'
import { createLogger } from '@/lib/logger'
import { toGraphMessage, type OutgoingMessage } from './graph-message'

const log = createLogger('[Messenger send]', 'DEBUG_MESSENGER')

/** Marks our own sends; echoes carrying it are never mistaken for staff. */
export const BOT_METADATA = 'wn'
/** Graph error_subcode: "another app is controlling this thread now". */
const THREAD_CONTROLLED_BY_ANOTHER_APP = 2018300
const SEND_TIMEOUT_MS = 8000

export interface GraphError {
  code?: number
  subcode?: number
  message?: string
}

export type SendResult = { ok: true; sent: number } | { ok: false; sent: number; error: GraphError }

type Fetch = typeof fetch

async function postGraph(path: string, token: string, body: unknown, fetchImpl: Fetch): Promise<{ ok: true } | { ok: false; error: GraphError }> {
  try {
    const response = await fetchImpl(`${FACEBOOK_GRAPH_API}${path}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (response.ok) return { ok: true }
    const text = await response.text()
    try {
      const parsed = JSON.parse(text) as { error?: { code?: number; error_subcode?: number; message?: string } }
      return { ok: false, error: { code: parsed.error?.code, subcode: parsed.error?.error_subcode, message: parsed.error?.message?.slice(0, 200) } }
    } catch {
      return { ok: false, error: { message: `HTTP ${response.status}` } }
    }
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message.slice(0, 200) : 'network error' } }
  }
}

export type MessagingType = 'RESPONSE' | 'UPDATE'

function sendOne(token: string, psid: string, message: OutgoingMessage, fetchImpl: Fetch, messagingType: MessagingType) {
  return postGraph('/me/messages', token, {
    recipient: { id: psid },
    messaging_type: messagingType,
    message: { ...toGraphMessage(message), metadata: BOT_METADATA },
  }, fetchImpl)
}

export function maskPsid(psid: string): string {
  return psid.length > 4 ? `****${psid.slice(-4)}` : '****'
}

/**
 * Send `messages` in order. Stops at the first refusal (a later message in a
 * reply makes no sense without the earlier one). When another app holds the
 * thread (2018300) it takes control once and retries, like `sendMessage`.
 */
export async function sendMessages(
  token: string,
  psid: string,
  messages: readonly OutgoingMessage[],
  fetchImpl: Fetch = fetch,
  messagingType: MessagingType = 'RESPONSE',
): Promise<SendResult> {
  if (messages.length === 0) return { ok: true, sent: 0 }
  // Best effort: a typing bubble while the reply goes out.
  void postGraph('/me/messages', token, { recipient: { id: psid }, sender_action: 'typing_on' }, fetchImpl)

  let sent = 0
  let tookControl = false
  for (const message of messages) {
    let result = await sendOne(token, psid, message, fetchImpl, messagingType)
    if (!result.ok && result.error.subcode === THREAD_CONTROLLED_BY_ANOTHER_APP && !tookControl) {
      tookControl = true
      const take = await postGraph('/me/take_thread_control', token, { recipient: { id: psid }, metadata: 'webnegosyo_automation' }, fetchImpl)
      if (take.ok) result = await sendOne(token, psid, message, fetchImpl, messagingType)
    }
    if (!result.ok) {
      console.error('[Messenger send] refused', { psid: maskPsid(psid), code: result.error.code, subcode: result.error.subcode, message: result.error.message })
      return { ok: false, sent, error: result.error }
    }
    sent += 1
  }
  log.debug('sent', { psid: maskPsid(psid), sent })
  return { ok: true, sent }
}

/** POST or DELETE on /me/messenger_profile (Get Started, ice breakers, persistent menu). */
export async function callMessengerProfile(
  token: string,
  method: 'POST' | 'DELETE',
  body: Record<string, unknown>,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: GraphError }> {
  if (method === 'POST') return postGraph('/me/messenger_profile', token, body, fetchImpl)
  try {
    const response = await fetchImpl(`${FACEBOOK_GRAPH_API}/me/messenger_profile?access_token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    return response.ok ? { ok: true } : { ok: false, error: { message: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` } }
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message.slice(0, 200) : 'network error' } }
  }
}
