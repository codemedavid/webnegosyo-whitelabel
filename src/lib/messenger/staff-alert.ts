/**
 * "A customer needs you" (plan `docs/plans/2026-11-15-messenger-reply-from-app.md`
 * R4 + T1): the bot stepped back, so a person has to answer. The chat is
 * marked **Needs a reply** (`messenger_sessions.needs_reply_since`) and the
 * store's devices get one push.
 *
 * Only three moments, so phones don't buzz for every message the bot answers:
 * the customer asked for a person, typed an order the bot noticed, or wrote
 * while staff had the bot paused.
 *
 * Pure: who gets the push and what it says. `staff-alert-deps.ts` sends it.
 */

import { hasPermission, ORDER_READ_KEYS } from '@/lib/staff-permissions'
import type { DeviceAccount } from '@/lib/push/merchant-notification-push'

export type StaffAlertReason = 'asked' | 'typed_order' | 'while_paused' | 'wants_change'

/** The Android channel the app creates for chat alerts (`webnegosyo-app/lib/notifications.ts`). Never the order ringtone. */
export const CHAT_ALERT_CHANNEL = 'chat-alerts'
/** One push per chat in this long; the chip already says it waits. */
export const CHAT_ALERT_GAP_SECONDS = 10 * 60
const PREVIEW_MAX = 60

export interface ChatAlertMessage {
  to: string
  sound: 'default'
  channelId: typeof CHAT_ALERT_CHANNEL
  priority: 'high'
  title: string
  body: string
  data: { type: 'messenger_chat'; sessionId: string }
}

/**
 * Who hears about it: the people who can answer from the app, i.e. those who
 * may read the chat AND reply (store-wide with `pos`, the same as Make order),
 * plus the owner. Branch-locked accounts can't reply to a store's chat yet.
 */
export function canAnswerChat(account: DeviceAccount, tenantId: string): boolean {
  if (account.tenant_id !== tenantId) return false
  if (account.role !== 'admin' && account.role !== 'superadmin') return false
  if (account.outlet_id) return false
  const holder = { role: account.role, is_owner: account.is_owner ?? false, permissions: account.permissions }
  return ORDER_READ_KEYS.some((key) => hasPermission(holder, key)) && hasPermission(holder, 'pos')
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

const TITLES: Record<StaffAlertReason, (name: string) => string> = {
  asked: (name) => `${name} wants to talk to someone`,
  typed_order: (name) => `${name} typed an order`,
  while_paused: (name) => `${name} wrote`,
  wants_change: (name) => `${name} wants to change their order`,
}

/** "Ana C." from the Messenger name, or a plain label when Meta gave none. */
export function alertName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  if (!first) return 'A Messenger customer'
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

export function buildChatAlertMessages(input: {
  tenantId: string
  sessionId: string
  reason: StaffAlertReason
  customerName: string
  /** What the customer wrote (first 60 characters are shown). */
  text: string
  devices: readonly DeviceAccount[]
}): ChatAlertMessage[] {
  const body = clip(input.text, PREVIEW_MAX) || 'Open the chat to reply.'
  const title = TITLES[input.reason](input.customerName)
  const seen = new Set<string>()
  return input.devices.flatMap((device): ChatAlertMessage[] => {
    if (!canAnswerChat(device, input.tenantId) || seen.has(device.token)) return []
    seen.add(device.token)
    return [{
      to: device.token, sound: 'default', channelId: CHAT_ALERT_CHANNEL, priority: 'high',
      title, body, data: { type: 'messenger_chat', sessionId: input.sessionId },
    }]
  })
}
