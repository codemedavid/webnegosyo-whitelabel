/**
 * `messenger_sessions`: one row per store + customer (PSID).
 *
 * Service role only (customers' PSIDs and carts). The webhook stamps
 * `last_inbound_at` on everything the customer does — that is Meta's 24h
 * window — and a staff reply sets `bot_paused_until`.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { maskPsid } from './send'

export interface MessengerSession {
  id: string
  botPausedUntil: Date | null
}

interface SessionRow {
  id: string
  bot_paused_until: string | null
}

function toSession(row: SessionRow): MessengerSession {
  return { id: row.id, botPausedUntil: row.bot_paused_until ? new Date(row.bot_paused_until) : null }
}

/**
 * Upsert the session and return it, or null when it can't be written (the
 * reply still goes out, just without a signed link).
 *
 * Until release 2 drops the old `UNIQUE(psid)`, a PSID already held by another
 * store's row is refused (23505) — PSIDs are page-scoped, so that only happens
 * when one Page moved between stores.
 */
export async function touchSession(input: {
  tenantId: string
  pageId: string
  psid: string
  now: Date
  /** True for anything the customer did (opens the 24h window). */
  isInbound: boolean
}): Promise<MessengerSession | null> {
  const nowIso = input.now.toISOString()
  const { data, error } = await createAdminClient()
    .from('messenger_sessions')
    .upsert(
      {
        tenant_id: input.tenantId,
        psid: input.psid,
        page_id: input.pageId,
        updated_at: nowIso,
        ...(input.isInbound ? { last_inbound_at: nowIso } : {}),
      } as never,
      { onConflict: 'tenant_id,psid' },
    )
    .select('id, bot_paused_until')
    .single()

  if (error && PRE_MIGRATION_CODES.has(error.code ?? '')) return touchLegacySession(input)
  if (error || !data) {
    console.error('[Messenger] session not written', { psid: maskPsid(input.psid), code: error?.code, message: error?.message })
    return null
  }
  return toSession(data as SessionRow)
}

/** Undefined column / no (tenant_id, psid) unique index: 20261110000421 is not applied yet. */
const PRE_MIGRATION_CODES = new Set(['42703', '42P10', 'PGRST204'])

/**
 * The pre-2026-11-10 session write (keyed on psid alone). Keeps link tokens
 * working on a database without the new columns, so deploying the code
 * before the migration never drops customers' Messenger links.
 */
async function touchLegacySession(input: { tenantId: string; psid: string; now: Date }): Promise<MessengerSession | null> {
  const { data, error } = await createAdminClient()
    .from('messenger_sessions')
    .upsert({ psid: input.psid, tenant_id: input.tenantId, state: 'menu', updated_at: input.now.toISOString() }, { onConflict: 'psid' })
    .select('id, tenant_id')
    .single()
  const row = data as { id: string; tenant_id: string } | null
  if (error || !row || row.tenant_id !== input.tenantId) {
    console.error('[Messenger] legacy session not written', { psid: maskPsid(input.psid), code: error?.code })
    return null
  }
  return { id: row.id, botPausedUntil: null }
}

/** Pause (or, with `until = null`, resume) the bot for one customer. Asserts the row changed. */
export async function setBotPause(sessionId: string, until: Date | null): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('messenger_sessions')
    .update({ bot_paused_until: until ? until.toISOString() : null } as never)
    .eq('id', sessionId)
    .select('id')
  if (error || !data || data.length !== 1) {
    console.error('[Messenger] bot pause not stored', { code: error?.code, message: error?.message })
    return false
  }
  return true
}

/** Session id → its store + PSID, for a signed link token. */
export async function readSessionOwner(sessionId: string): Promise<{ tenantId: string; psid: string } | null> {
  const { data, error } = await createAdminClient()
    .from('messenger_sessions')
    .select('tenant_id, psid')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { tenant_id: string; psid: string }
  return { tenantId: row.tenant_id, psid: row.psid }
}
