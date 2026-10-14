/**
 * "Texts are waiting": when automated texts are due but the store's sending
 * phone has not checked in for half an hour (switched off, out of battery,
 * gateway toggled off), the OWNER's phones get one push — daytime only, at
 * most every 12 hours. The alert is claimed with a conditional UPDATE on
 * `sms_settings.waiting_alert_at`, so racing ticks never double-notify.
 * Server-only (service role).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendExpoPushMessages } from '@/lib/push/expo-delivery'
import { isQuietAt } from '../quiet-hours'

const QUIET_PHONE_MS = 30 * 60_000
const ALERT_EVERY_MS = 12 * 3_600_000
/** The owner's own night: no buzzing between 9pm and 8am Manila. */
const OWNER_NIGHT = { start: '21:00', end: '08:00' } as const

export const TEXTS_WAITING_PUSH_KIND = 'sms_texts_waiting'

export interface WaitingAlertInput {
  waitingDue: number
  lastSeenAt: string | null
  lastAlertAt: string | null
  now: Date
}

export function waitingAlertDue({ waitingDue, lastSeenAt, lastAlertAt, now }: WaitingAlertInput): boolean {
  if (waitingDue <= 0 || isQuietAt(now, OWNER_NIGHT.start, OWNER_NIGHT.end)) return false
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN
  if (Number.isFinite(seen) && now.getTime() - seen < QUIET_PHONE_MS) return false
  const alerted = lastAlertAt ? Date.parse(lastAlertAt) : NaN
  return !(Number.isFinite(alerted) && now.getTime() - alerted < ALERT_EVERY_MS)
}

type Send = (messages: readonly { to: string }[]) => Promise<unknown>

async function countDueTexts(client: SupabaseClient, tenantId: string, now: Date): Promise<number> {
  const { count, error } = await client.from('sms_outbox').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('status', 'queued').lte('not_before', now.toISOString()).gt('expires_at', now.toISOString())
  if (error) throw new Error(`waiting texts: ${error.message}`)
  return count ?? 0
}

async function lastHeartbeat(client: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await client.from('loyalty_sms_device_heartbeats').select('last_seen_at')
    .eq('tenant_id', tenantId).order('last_seen_at', { ascending: false }).limit(1)
  if (error) throw new Error(`sender heartbeat: ${error.message}`)
  return ((data ?? []) as { last_seen_at: string }[])[0]?.last_seen_at ?? null
}

/** Claims the alert slot; false when another tick (or a recent alert) holds it. */
async function claimAlert(client: SupabaseClient, tenantId: string, now: Date): Promise<boolean> {
  await client.from('sms_settings').insert({ tenant_id: tenantId }).then(() => undefined, () => undefined)
  const cutoff = new Date(now.getTime() - ALERT_EVERY_MS).toISOString()
  const { data, error } = await client.from('sms_settings').update({ waiting_alert_at: now.toISOString() })
    .eq('tenant_id', tenantId).or(`waiting_alert_at.is.null,waiting_alert_at.lt.${cutoff}`).select('tenant_id')
  if (error) throw new Error(`waiting alert: ${error.message}`)
  return (data ?? []).length === 1
}

async function ownerTokens(client: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data: owners, error } = await client.from('app_users').select('user_id').eq('tenant_id', tenantId).eq('is_owner', true)
  if (error) throw new Error(`owners: ${error.message}`)
  const ownerIds = ((owners ?? []) as { user_id: string }[]).map((row) => row.user_id)
  if (ownerIds.length === 0) return []
  const { data: tokens, error: tokenError } = await client.from('platform_device_tokens').select('token, user_id')
    .eq('tenant_id', tenantId).in('user_id', ownerIds)
  if (tokenError) throw new Error(`devices: ${tokenError.message}`)
  return ((tokens ?? []) as { token: string; user_id: string }[])
    .filter((row) => ownerIds.includes(row.user_id)).map((row) => row.token)
}

/** True when a push went out. Never throws past a failed send: the next tick tries again in 12 hours. */
export async function alertWaitingTexts(
  client: SupabaseClient, tenantId: string, now: Date, send: Send = sendExpoPushMessages,
): Promise<boolean> {
  const waitingDue = await countDueTexts(client, tenantId, now)
  const lastSeenAt = waitingDue > 0 ? await lastHeartbeat(client, tenantId) : null
  if (!waitingAlertDue({ waitingDue, lastSeenAt, lastAlertAt: null, now })) return false
  if (!(await claimAlert(client, tenantId, now))) return false
  const tokens = await ownerTokens(client, tenantId)
  if (tokens.length === 0) return false
  const noun = waitingDue === 1 ? 'text is' : 'texts are'
  await send(tokens.map((to) => ({
    to,
    sound: 'default',
    title: 'Your automated texts are waiting',
    body: `${waitingDue} ${noun} waiting for your sending phone. Open SmartMenu on it and switch sending on.`,
    data: { kind: TEXTS_WAITING_PUSH_KIND },
  })))
  return true
}
