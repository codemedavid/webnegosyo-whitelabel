/**
 * Queue and follow one owner test text (web Texts → Send a test). Server-only,
 * service role — the caller has already passed `requireTextsAccess`.
 *
 * The row goes through the normal claim/finish, so a "Sent" here is the same
 * proof as for any guest text. Nothing here logs the typed number.
 */

import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isQuietAt, nextSendableAt } from '@/lib/sms-automations/quiet-hours'
import { readSettings } from '@/lib/sms-automations/api/reads'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import { phoneDisplayName } from '../phone-health'
import { TEST_TEXT_DAILY_LIMIT, TEST_TEXT_EXPIRY_MS, testTextBody, type TestTextState, type TestTextStatus } from '../test-text'
import { manilaDayStart } from './phones'

const TEST_PRIORITY = 1

const refuse = <T>(status: number, error: string, code: string): Outcome<T> => ({ ok: false, status, error, code })

async function hasEnabledPhone(db: SupabaseClient, tenantId: string): Promise<boolean> {
  const { count, error } = await db.from('loyalty_sms_devices').select('device_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('enabled', true)
  if (error) throw new Error(`sending phones: ${error.message}`)
  return (count ?? 0) > 0
}

/** A number that asked this store to stop gets no text, test or not. */
async function isSuppressed(db: SupabaseClient, tenantId: string, phone: string): Promise<boolean> {
  const { count, error } = await db.from('sms_suppressions').select('phone_e164', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('phone_e164', phone)
  if (error) throw new Error(`stopped numbers: ${error.message}`)
  return (count ?? 0) > 0
}

async function testsToday(db: SupabaseClient, tenantId: string, now: Date): Promise<number> {
  const { count, error } = await db.from('sms_outbox').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('source', 'test').gte('created_at', manilaDayStart(now).toISOString())
  if (error) throw new Error(`test texts: ${error.message}`)
  return count ?? 0
}

async function storeName(db: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  if (error) throw new Error(`store: ${error.message}`)
  return (data as { name?: string } | null)?.name ?? null
}

/** Queue one test text to `phone` (already E.164). */
export async function queueTestText(
  db: SupabaseClient, tenantId: string, phone: string, now = new Date(),
): Promise<Outcome<{ id: string }>> {
  if (!(await hasEnabledPhone(db, tenantId))) {
    return refuse(409, 'Connect a sending phone first.', 'no_phone')
  }
  if (await isSuppressed(db, tenantId, phone)) {
    return refuse(409, 'That number asked this store to stop texting it.', 'suppressed')
  }
  if ((await testsToday(db, tenantId, now)) >= TEST_TEXT_DAILY_LIMIT) {
    return refuse(429, `That's ${TEST_TEXT_DAILY_LIMIT} test texts today. Try again tomorrow.`, 'test_limit')
  }
  // A test asked for during quiet hours waits for them to end instead of expiring unseen.
  const settings = await readSettings(db, tenantId)
  const sendableAt = nextSendableAt(now, settings.quietHoursStart, settings.quietHoursEnd)
  const { data, error } = await db.from('sms_outbox').insert({
    tenant_id: tenantId,
    automation_id: null,
    customer_id: null,
    recipe: 'test',
    family: 'test',
    source: 'test',
    phone_e164: phone,
    body: testTextBody(await storeName(db, tenantId)),
    occurrence_key: `test:${randomUUID()}`,
    priority: TEST_PRIORITY,
    not_before: now.toISOString(),
    expires_at: new Date(Math.max(now.getTime(), sendableAt.getTime()) + TEST_TEXT_EXPIRY_MS).toISOString(),
  }).select('id').single()
  if (error || !data) throw new Error(`test text could not be queued: ${error?.message ?? 'no row'}`)
  return { ok: true, value: { id: (data as { id: string }).id } }
}

interface TestRow {
  id: string
  status: TestTextStatus
  error: string | null
  created_at: string
  sent_at: string | null
  claimed_by_device: string | null
}

async function phoneNameOf(db: SupabaseClient, tenantId: string, deviceId: string | null): Promise<string | null> {
  if (!deviceId) return null
  const { data, error } = await db.from('sms_sender_devices').select('label, manufacturer, model')
    .eq('tenant_id', tenantId).eq('device_id', deviceId).maybeSingle()
  if (error) throw new Error(`sending phone: ${error.message}`)
  const row = data as { label: string | null; manufacturer: string | null; model: string | null } | null
  return row ? phoneDisplayName(row) : null
}

/** Where one test text is now; null when it isn't this store's test. Runs the sweep first so "expired" is honest. */
export async function readTestText(db: SupabaseClient, tenantId: string, id: string, now = new Date()): Promise<TestTextState | null> {
  await db.rpc('sweep_sms_outbox', { p_tenant_id: tenantId })
  const { data, error } = await db.from('sms_outbox').select('id, status, error, created_at, sent_at, claimed_by_device')
    .eq('tenant_id', tenantId).eq('id', id).eq('source', 'test').maybeSingle()
  if (error) throw new Error(`test text: ${error.message}`)
  const row = data as TestRow | null
  if (!row) return null
  const [phoneName, settings] = await Promise.all([
    phoneNameOf(db, tenantId, row.claimed_by_device),
    row.status === 'queued' ? readSettings(db, tenantId) : Promise.resolve(null),
  ])
  const isQuiet = settings !== null && isQuietAt(now, settings.quietHoursStart, settings.quietHoursEnd)
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    phoneName,
    quietUntil: isQuiet && settings ? nextSendableAt(now, settings.quietHoursStart, settings.quietHoursEnd).toISOString() : null,
  }
}
