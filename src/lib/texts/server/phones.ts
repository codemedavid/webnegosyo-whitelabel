/**
 * Sending phones for /admin/texts: list (with the online rule applied at the
 * server's clock), rename, disconnect, and the phone's own report from the
 * outbox claim. Server-only, service role — the caller has already passed
 * `requireTextsAccess` (or, for `recordPhoneInfo`, the claim RPC has
 * authenticated the device credential).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { isQuietAt } from '@/lib/sms-automations/quiet-hours'
import { readOutlook, readSettings, ReadError } from '@/lib/sms-automations/api/reads'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import { isAppOld, phoneDisplayName, phoneHealth, withDistinctNames } from '../phone-health'
import type { PhoneInfo } from '../phone-info'
import type { SendingPhone } from '../types'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
const MANILA_OFFSET_MS = 8 * 3_600_000
const DAY_MS = 86_400_000
/** Same cap as enroll_loyalty_sms_device. */
export const MAX_SENDER_PHONES = 5
export const MAX_PHONE_LABEL = 40

const text = z.string().nullish().transform((value) => value ?? null)
const flag = z.boolean().nullish().transform((value) => value ?? null)
const count = z.number().int().nonnegative().nullish().transform((value) => value ?? 0)
const rowSchema = z.object({
  device_id: z.string().min(1),
  label: text, manufacturer: text, model: text, os_version: text, app_version: text,
  sms_permission: flag, ignoring_battery_opt: flag,
  last_seen_at: text, enrolled_at: text, enrolled_by: text,
  sent_today: count, failed_today: count, claimed_now: count,
})
export type SenderDeviceRow = z.infer<typeof rowSchema>

export interface PhoneContext {
  now: Date
  isQuietNow: boolean
  isLimitReached: boolean
}

/** Manila midnight today, at the server's clock. */
export function manilaDayStart(now: Date): Date {
  return new Date(Math.floor((now.getTime() + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS)
}

/** One row per ENABLED phone (`list_sms_sender_devices`). Throws ReadError. */
export async function readSenderDevices(db: SupabaseClient, tenantId: string, now: Date): Promise<SenderDeviceRow[]> {
  const { data, error } = await db.rpc('list_sms_sender_devices', {
    p_tenant_id: tenantId, p_day_start: manilaDayStart(now).toISOString(),
  })
  if (error) throw new ReadError(`sending phones: ${error.message}`)
  const parsed = z.array(rowSchema).safeParse(data ?? [])
  if (!parsed.success) throw new ReadError('sending phones: unexpected shape')
  return parsed.data
}

export function toSendingPhone(row: SenderDeviceRow, ctx: PhoneContext): SendingPhone {
  const health = phoneHealth({ lastSeenAt: row.last_seen_at, ...ctx })
  return {
    deviceId: row.device_id,
    name: phoneDisplayName(row),
    hasCustomName: Boolean(row.label?.trim()),
    model: row.model,
    appVersion: row.app_version,
    isAppOld: isAppOld(row.app_version),
    state: health.state,
    lastSeenAt: row.last_seen_at,
    ageSeconds: health.ageSeconds,
    isInactive: health.isInactive,
    connectedAt: row.enrolled_at,
    connectedBy: row.enrolled_by,
    sentToday: row.sent_today,
    failedToday: row.failed_today,
    sendingNow: row.claimed_now,
    smsPermission: row.sms_permission,
    isBatteryUnrestricted: row.ignoring_battery_opt,
  }
}

export async function listSendingPhones(db: SupabaseClient, tenantId: string, now: Date): Promise<SendingPhone[]> {
  const settings = await readSettings(db, tenantId)
  const [outlook, rows] = await Promise.all([
    readOutlook(db, tenantId, settings, now),
    readSenderDevices(db, tenantId, now),
  ])
  const ctx: PhoneContext = {
    now,
    isQuietNow: isQuietAt(now, settings.quietHoursStart, settings.quietHoursEnd),
    isLimitReached: outlook.sentToday >= outlook.dailyLimit,
  }
  return withDistinctNames(rows.map((row) => toSendingPhone(row, ctx)))
}

const refuse = (status: number, error: string, code?: string): Outcome<null> => ({ ok: false, status, error, code })
const NOT_CONNECTED = 'That phone is no longer connected. Refresh the page.'

async function isEnabledDevice(db: SupabaseClient, tenantId: string, deviceId: string): Promise<boolean> {
  const { data, error } = await db.from('loyalty_sms_devices').select('device_id')
    .eq('tenant_id', tenantId).eq('device_id', deviceId).eq('enabled', true).maybeSingle()
  if (error) throw new Error(`sending phone: ${error.message}`)
  return data !== null
}

/** Anyone with Texts access may rename. The phone itself never writes `label`. */
export async function renamePhone(db: SupabaseClient, tenantId: string, deviceId: string, label: string): Promise<Outcome<null>> {
  const name = label.replace(/\s+/g, ' ').trim()
  if (name.length < 1 || name.length > MAX_PHONE_LABEL) {
    return refuse(400, `Use 1 to ${MAX_PHONE_LABEL} characters for the name.`, 'invalid_label')
  }
  if (!(await isEnabledDevice(db, tenantId, deviceId))) return refuse(404, NOT_CONNECTED, 'not_found')
  const { error } = await db.from('sms_sender_devices')
    .upsert({ device_id: deviceId, tenant_id: tenantId, label: name }, { onConflict: 'device_id' })
  if (error) throw new Error(`phone name could not be saved: ${error.message}`)
  return { ok: true, value: null }
}

/**
 * Owner only — the action checks `isOwner`, and `revoke_loyalty_sms_device`
 * re-checks owner/superadmin in SQL. A revoked phone gets a 403 on its next
 * claim and forgets its enrolment; texts queued for it stay for other phones.
 */
export async function disconnectPhone(
  db: SupabaseClient, tenantId: string, actorId: string, deviceId: string,
): Promise<Outcome<null>> {
  const { data, error } = await db.rpc('revoke_loyalty_sms_device', {
    p_tenant_id: tenantId, p_actor_id: actorId, p_device_id: deviceId,
  })
  if (error) throw new Error(`phone could not be disconnected: ${error.message}`)
  const isOk = typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === true
  // The action already checked the owner, so a refusal here is a phone that is not this store's.
  return isOk ? { ok: true, value: null } : refuse(403, NOT_CONNECTED, 'refused')
}

/**
 * What the phone said about itself on its claim. Best effort: never throws,
 * never blocks the claim. `record_sms_sender_info` re-checks the device and
 * writes only on a change or every 6 hours.
 */
export async function recordPhoneInfo(db: SupabaseClient, tenantId: string, deviceId: string, info: PhoneInfo): Promise<void> {
  try {
    const { error } = await db.rpc('record_sms_sender_info', {
      p_tenant_id: tenantId, p_device_id: deviceId,
      p_manufacturer: info.manufacturer, p_model: info.model, p_os: info.osVersion, p_app: info.appVersion,
      p_sms: info.smsPermission, p_bat: info.isBatteryUnrestricted,
    })
    if (error) log.error('phone info not recorded', { tenantId, code: error.code ?? null })
  } catch (error) {
    log.error('phone info not recorded', { tenantId, error: error instanceof Error ? error.message : String(error) })
  }
}
