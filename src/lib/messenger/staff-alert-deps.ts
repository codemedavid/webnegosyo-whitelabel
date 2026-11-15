/**
 * Side effects of `staff-alert.ts`: mark the chat **Needs a reply** and push
 * the store's devices (at most once per chat per 10 minutes). Never throws:
 * a missed push or mark must not cost the customer their reply.
 */

import 'server-only'
import { describePushFailures, sendExpoPushMessages } from '@/lib/push/expo-delivery'
import { joinDeviceAccounts, type AccountRow, type DeviceTokenRow } from '@/lib/push/merchant-notification-push'
import { pruneStaleTokens } from '@/lib/push/push-route-helpers'
import { createOnceClaims, type OnceClaims } from './dedupe'
import { messengerDb } from './service-db'
import { alertName, buildChatAlertMessages, CHAT_ALERT_GAP_SECONDS, type StaffAlertReason } from './staff-alert'

const LOG = '[Messenger] staff alert'

/** At most one push per chat per gap. Fails OPEN in Redis (a rare double push beats a customer nobody sees); the instance still holds it. */
let alertSlots: OnceClaims | null = null
const slots = (): OnceClaims => (alertSlots ??= createOnceClaims('alert', CHAT_ALERT_GAP_SECONDS))

async function markNeedsReply(sessionId: string, now: Date): Promise<void> {
  const { error } = await messengerDb()
    .from('messenger_sessions')
    .update({ needs_reply_since: now.toISOString() })
    .eq('id', sessionId)
    .is('needs_reply_since', null)
  if (error) console.error(`${LOG}: not marked`, { code: error.code })
}

/** A person answered (Page Inbox or the app): the chat no longer waits. */
export async function clearNeedsReply(sessionId: string): Promise<void> {
  try {
    const { error } = await messengerDb()
      .from('messenger_sessions')
      .update({ needs_reply_since: null })
      .eq('id', sessionId)
      .not('needs_reply_since', 'is', null)
    if (error) console.error(`${LOG}: not cleared`, { code: error.code })
  } catch (error) {
    console.error(`${LOG}: not cleared`, error instanceof Error ? error.message : error)
  }
}

export async function alertStaff(input: {
  tenantId: string
  sessionId: string
  reason: StaffAlertReason
  firstName: string | null
  text: string
  now: Date
}): Promise<void> {
  try {
    await markNeedsReply(input.sessionId, input.now)
    if (!(await slots().claim(input.sessionId))) return

    const admin = messengerDb()
    const [tokens, accounts] = await Promise.all([
      admin.from('platform_device_tokens').select('token, user_id, tenant_id').eq('tenant_id', input.tenantId),
      admin.from('app_users').select('user_id, tenant_id, role, is_owner, permissions, outlet_id')
        .eq('tenant_id', input.tenantId).in('role', ['admin', 'superadmin']),
    ])
    if (tokens.error || accounts.error) {
      console.error(`${LOG}: recipients not readable`, { code: tokens.error?.code ?? accounts.error?.code })
      return
    }
    const devices = joinDeviceAccounts((tokens.data ?? []) as DeviceTokenRow[], (accounts.data ?? []) as AccountRow[])
    const messages = buildChatAlertMessages({
      tenantId: input.tenantId, sessionId: input.sessionId, reason: input.reason,
      customerName: alertName(input.firstName, null), text: input.text, devices,
    })
    if (messages.length === 0) return

    const { failures, failedChunks } = await sendExpoPushMessages(messages)
    const refusals = describePushFailures(failures)
    if (refusals) console.error(`${LOG}: ticket refusals ${refusals}`)
    if (failedChunks > 0) console.error(`${LOG}: ${failedChunks} chunk(s) never reached Expo`)
    await pruneStaleTokens(admin, failures, LOG)
  } catch (error) {
    console.error(`${LOG}: failed`, error instanceof Error ? error.message : error)
  }
}
