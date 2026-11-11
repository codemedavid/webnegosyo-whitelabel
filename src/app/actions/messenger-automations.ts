'use server'

/**
 * Settings → Messenger → Automations writes.
 *
 * Rules and settings go through the caller's session client (RLS:
 * `app_user_manages_messenger` = `settings` on a store-wide account), the rule
 * set in ONE transaction with a version check (`save_messenger_rules`). Only
 * the Messenger Profile sync, the test code and the test send use the service
 * role, because the page token and the owner's PSID are not staff-readable.
 */

import crypto from 'crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { verifyTenantPermission } from '@/lib/admin-service'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantActivePageById } from '@/lib/facebook/page-tokens'
import { actionSchema, ruleSchema, ruleSetProblems, type MessengerRule } from '@/lib/messenger/rules'
import { loadStoreBundle } from '@/lib/messenger/load-store'
import { syncMessengerProfile, type ProfileSyncOutcome } from '@/lib/messenger/profile-sync'
import { buildReply, withPreviewData } from '@/lib/messenger/replies'
import { sendMessages } from '@/lib/messenger/send'
import { touchSession } from '@/lib/messenger/session'
import { createMessengerLinkToken } from '@/lib/messenger/link-token'
import { hashTesterCode, newTesterCode, TESTER_CODE_TTL_MS } from '@/lib/messenger/tester'
import { MAX_ORDER_UPDATE_TEXT, orderUpdatesSchema, UPDATE_STATUSES, type OrderUpdatesConfig } from '@/lib/messenger/order-view'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TAKEOVER_CHOICES = [0, 30, 60, 240, 1440] as const

const saveSchema = z.object({
  tenantId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  rules: z.array(ruleSchema).max(50),
  botEnabled: z.boolean(),
  takeoverMinutes: z.number().int().refine((value) => (TAKEOVER_CHOICES as readonly number[]).includes(value)),
}).strict()

export type SaveMessengerAutomationsInput = z.input<typeof saveSchema>

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

const NOT_ALLOWED = 'You need the Settings permission on a store-wide account to change Messenger automations.'

async function authorize(tenantId: string): Promise<{ userId: string } | { error: string }> {
  try {
    const { user, userRole } = await verifyTenantPermission(tenantId, 'settings')
    const role = userRole as { role: string; outlet_id?: string | null; is_owner?: boolean | null }
    const isStoreWide = role.role === 'superadmin' || !role.outlet_id || role.is_owner === true
    return isStoreWide ? { userId: user.id } : { error: NOT_ALLOWED }
  } catch {
    return { error: NOT_ALLOWED }
  }
}

/** Ids from the editor's built-in rules (`default-menu`) or new rows get a real uuid. */
function withRowIds(rules: readonly MessengerRule[]): MessengerRule[] {
  return rules.map((rule) => (UUID_PATTERN.test(rule.id) ? rule : { ...rule, id: crypto.randomUUID() }))
}

export async function saveMessengerAutomationsAction(
  input: SaveMessengerAutomationsInput,
): Promise<ActionResult<{ version: number; rules: MessengerRule[]; profile: ProfileSyncOutcome; profileError?: string }>> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Some automations are incomplete. Check the highlighted ones and try again.' }
  const { tenantId, expectedVersion, botEnabled, takeoverMinutes } = parsed.data

  const access = await authorize(tenantId)
  if ('error' in access) return { ok: false, error: access.error }

  const problems = ruleSetProblems(parsed.data.rules)
  if (problems.length > 0) return { ok: false, error: problems[0] }
  const rules = withRowIds(parsed.data.rules)

  const supabase = await createClient()
  // Rules, bot on/off and the takeover setting in ONE transaction.
  const { data: version, error: saveError } = await supabase.rpc('save_messenger_rules', {
    p_tenant_id: tenantId,
    p_expected_version: expectedVersion,
    p_rules: rules.map((rule) => ({ id: rule.id, name: rule.name, trigger: rule.trigger, action: rule.action, is_enabled: rule.isEnabled })),
    p_bot_enabled: botEnabled,
    p_takeover_minutes: takeoverMinutes,
  })
  if (saveError) {
    if (saveError.code === '40001') return { ok: false, error: 'Someone else saved these automations a moment ago. Reload the page to see their changes.' }
    console.error('[Messenger automations] save refused', { tenantId, code: saveError.code, message: saveError.message })
    return { ok: false, error: saveError.code === '42501' ? NOT_ALLOWED : "Couldn't save your automations. Please try again." }
  }

  const { data: tenant } = await supabase.from('tenants').select('slug, facebook_page_id').eq('id', tenantId).maybeSingle()
  const tenantRow = tenant as { slug: string; facebook_page_id: string | null } | null
  const sync = await syncMessengerProfile(tenantId, tenantRow?.facebook_page_id ?? null)
  if (tenantRow?.slug) revalidatePath(`/${tenantRow.slug}/admin/settings/messenger/automations`)

  return { ok: true, version: Number(version), rules, profile: sync.outcome, ...(sync.error ? { profileError: sync.error } : {}) }
}

/** A fresh "TEST 123456" code for the owner to message their Page (10 minutes, one use). */
export async function createMessengerTesterCodeAction(tenantId: string): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  if (!z.string().uuid().safeParse(tenantId).success) return { ok: false, error: NOT_ALLOWED }
  const access = await authorize(tenantId)
  if ('error' in access) return { ok: false, error: access.error }

  const code = newTesterCode()
  const expiresAt = new Date(Date.now() + TESTER_CODE_TTL_MS)
  const { data, error } = await createAdminClient()
    .from('messenger_settings')
    .upsert({ tenant_id: tenantId, tester_code_hash: hashTesterCode(tenantId, code), tester_code_expires_at: expiresAt.toISOString() } as never, { onConflict: 'tenant_id' })
    .select('tenant_id')
  if (error || !data || (data as unknown[]).length !== 1) {
    console.error('[Messenger automations] tester code not stored', { tenantId, code: error?.code })
    return { ok: false, error: "Couldn't make a test code. Please try again." }
  }
  return { ok: true, code: `TEST ${code}`, expiresAt: expiresAt.toISOString() }
}

/** Whether a test chat is linked (never the PSID itself). */
export async function readMessengerTesterAction(tenantId: string): Promise<ActionResult<{ isLinked: boolean }>> {
  if (!z.string().uuid().safeParse(tenantId).success) return { ok: false, error: NOT_ALLOWED }
  const access = await authorize(tenantId)
  if ('error' in access) return { ok: false, error: access.error }
  const { data } = await createAdminClient().from('messenger_settings').select('tester_psid').eq('tenant_id', tenantId).maybeSingle()
  return { ok: true, isLinked: Boolean((data as { tester_psid: string | null } | null)?.tester_psid) }
}

/** Meta refuses a bot message more than 24h after the person last wrote. */
function testSendError(code: number | undefined, subcode: number | undefined): string {
  if (code === 10 || code === 551 || subcode === 2018278 || subcode === 2018108) {
    return 'Messenger only lets the bot reply within 24 hours of your last message. Send your Page any message, then try again.'
  }
  return "Facebook didn't accept the test message. Check that your Page is still connected, then try again."
}

export async function sendMessengerTestAction(tenantId: string, rawAction: unknown): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(tenantId).success) return { ok: false, error: NOT_ALLOWED }
  const action = actionSchema.safeParse(rawAction)
  if (!action.success) return { ok: false, error: 'Finish this automation before sending a test.' }
  const access = await authorize(tenantId)
  if ('error' in access) return { ok: false, error: access.error }

  const { data: settings } = await createAdminClient().from('messenger_settings').select('tester_psid').eq('tenant_id', tenantId).maybeSingle()
  const testerPsid = (settings as { tester_psid: string | null } | null)?.tester_psid
  if (!testerPsid) return { ok: false, error: 'Link your Messenger first: get a test code and send it to your Page.' }

  const bundle = await loadStoreBundle(tenantId)
  if (!bundle?.store) return { ok: false, error: "Couldn't read your menu right now. Please try again." }
  const page = bundle.facebookPageRowId ? await getTenantActivePageById(tenantId, bundle.facebookPageRowId) : null
  if (!page) return { ok: false, error: 'Connect your Facebook Page first.' }

  const session = await touchSession({ tenantId, pageId: page.page_id, psid: testerPsid, now: new Date(), isInbound: false })
  const linkToken = session ? createMessengerLinkToken(session.id) : null
  const result = await sendMessages(page.page_access_token, testerPsid, buildReply(action.data, withPreviewData({ store: bundle.store, linkToken })))
  return result.ok ? { ok: true } : { ok: false, error: testSendError(result.error.code, result.error.subcode) }
}

const orderUpdatesInput = z.object({ tenantId: z.string().uuid(), config: orderUpdatesSchema }).strict()

/**
 * Order status messages: on/off, which statuses, the owner's wording.
 * Through the caller's session client; the affected row is checked because an
 * RLS refusal on UPDATE is silent.
 */
export async function saveMessengerOrderUpdatesAction(input: { tenantId: string; config: OrderUpdatesConfig }): Promise<ActionResult<{ config: OrderUpdatesConfig }>> {
  const parsed = orderUpdatesInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: `Status messages can be at most ${MAX_ORDER_UPDATE_TEXT} characters.` }
  const { tenantId } = parsed.data
  const access = await authorize(tenantId)
  if ('error' in access) return { ok: false, error: access.error }

  const config: OrderUpdatesConfig = {
    enabled: parsed.data.config.enabled,
    statuses: UPDATE_STATUSES.filter((status) => parsed.data.config.statuses.includes(status)),
    texts: Object.fromEntries(Object.entries(parsed.data.config.texts).filter(([, text]) => typeof text === 'string' && text.trim() !== '')),
  }

  const supabase = await createClient()
  const updated = await supabase.from('messenger_settings')
    .update({ order_updates: config, updated_by: access.userId } as never)
    .eq('tenant_id', tenantId)
    .select('tenant_id')
  let rows = updated.data?.length ?? 0
  if (!updated.error && rows === 0) {
    const inserted = await supabase.from('messenger_settings')
      .insert({ tenant_id: tenantId, order_updates: config, updated_by: access.userId } as never)
      .select('tenant_id')
    if (inserted.error) {
      console.error('[Messenger automations] order updates not stored', { tenantId, code: inserted.error.code })
      return { ok: false, error: inserted.error.code === '42501' ? NOT_ALLOWED : "Couldn't save your status messages. Please try again." }
    }
    rows = inserted.data?.length ?? 0
  }
  if (updated.error || rows !== 1) {
    console.error('[Messenger automations] order updates not stored', { tenantId, code: updated.error?.code, rows })
    return { ok: false, error: updated.error?.code === '42501' ? NOT_ALLOWED : "Couldn't save your status messages. Please try again." }
  }
  return { ok: true, config }
}
