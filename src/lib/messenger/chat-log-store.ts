/**
 * Writes the chat log (`messenger_messages`) and the customer's Messenger
 * profile on `messenger_sessions`. Service role only (20261111224021).
 *
 * Nothing here may fail a reply: every error is logged once (never with the
 * PSID, a name or the text) and swallowed.
 */

import 'server-only'
import { FACEBOOK_GRAPH_API } from '@/lib/facebook/graph'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatPreview, clipText, type ChatLogLine } from './chat-log'

const PROFILE_TIMEOUT_MS = 2500

/** Missing column / table: 20261111224021 is not applied yet. Logged quietly. */
const PRE_MIGRATION_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

function logFailure(what: string, error: { code?: string; message?: string } | null) {
  if (error && PRE_MIGRATION_CODES.has(error.code ?? '')) return
  console.error(`[Messenger] ${what}`, { code: error?.code, message: error?.message?.slice(0, 200) })
}

/** One insert per event (a retried webhook's lines are skipped by `mid`), then the session's newest line. */
export async function writeChatLog(input: { tenantId: string; sessionId: string; lines: readonly ChatLogLine[] }): Promise<void> {
  if (input.lines.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('messenger_messages')
    .upsert(
      input.lines.map((line) => ({
        tenant_id: input.tenantId,
        session_id: input.sessionId,
        direction: line.direction,
        kind: line.kind,
        body: line.body,
        mid: line.mid,
        sent_at: line.sentAt.toISOString(),
      })) as never,
      { onConflict: 'mid', ignoreDuplicates: true },
    )
  if (error) {
    logFailure('chat log not written', error)
    return
  }

  const newest = input.lines.reduce((latest, line) => (line.sentAt.getTime() >= latest.sentAt.getTime() ? line : latest))
  const newestIso = newest.sentAt.toISOString()
  const { error: sessionError } = await admin
    .from('messenger_sessions')
    .update({ last_message_at: newestIso, last_message_preview: chatPreview(newest) } as never)
    .eq('id', input.sessionId)
    // A late, older event never moves the list backwards.
    .or(`last_message_at.is.null,last_message_at.lte."${newestIso}"`)
  if (sessionError) logFailure('chat preview not written', sessionError)
}

interface GraphProfile {
  first_name?: unknown
  last_name?: unknown
  profile_pic?: unknown
}

function nameField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text ? clipText(text, 80) : null
}

function photoField(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('https://') && value.length <= 2048 ? value : null
}

/**
 * Ask Meta's User Profile API for the customer's name and photo and store
 * them (or, on failure, just the attempt). Returns the raw first name to greet
 * with, or null. Never throws.
 */
export async function refreshCustomerProfile(
  input: { sessionId: string; token: string; psid: string; now: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let profile: { first_name: string | null; last_name: string | null; profile_pic_url: string | null } | null = null
  try {
    const url = `${FACEBOOK_GRAPH_API}/${encodeURIComponent(input.psid)}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(input.token)}`
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS) })
    if (response.ok) {
      const body = (await response.json()) as GraphProfile
      profile = { first_name: nameField(body.first_name), last_name: nameField(body.last_name), profile_pic_url: photoField(body.profile_pic) }
    } else {
      // Meta's code only (e.g. 10 / 230 = no permission for this person yet).
      const text = await response.text().catch(() => '')
      const code = /"code"\s*:\s*(\d+)/.exec(text)?.[1]
      console.error('[Messenger] profile not fetched', { status: response.status, code })
    }
  } catch (error) {
    console.error('[Messenger] profile not fetched', { message: error instanceof Error ? error.message.slice(0, 120) : 'network error' })
  }

  const { error } = await createAdminClient()
    .from('messenger_sessions')
    .update({ ...(profile ?? {}), profile_fetched_at: input.now.toISOString() } as never)
    .eq('id', input.sessionId)
  if (error) logFailure('profile not stored', error)
  return profile?.first_name ?? null
}
