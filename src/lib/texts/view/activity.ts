/**
 * The Activity tab: which statuses each filter asks the server for, the
 * request body (the app's `activity` action, plus the web's campaign
 * options), day grouping in Manila time, and every not-sent reason in words.
 * Pure.
 */

import { dayHeaderText, manilaDay, toMs } from './time'
import type { ActivityShow } from './url'

export type OutboxStatus = 'queued' | 'claimed' | 'sent' | 'failed' | 'cancelled' | 'expired' | 'skipped'

export interface ActivityItem {
  id: string
  automationId: string | null
  recipe: string
  guestName: string | null
  phoneLast4: string
  body: string
  status: OutboxStatus
  reason: string | null
  source: string
  notBefore: string
  createdAt: string
  sentAt: string | null
  /** Present on campaign rows when the server includes them. */
  campaignId?: string | null
  campaignName?: string | null
}

export interface ActivityPage {
  items: ActivityItem[]
  nextCursor: string | null
}

export const ACTIVITY_FILTERS: readonly { label: string; value: ActivityShow }[] = [
  { label: 'All', value: 'all' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Sent', value: 'sent' },
  { label: 'Not sent', value: 'not_sent' },
]

const NOT_SENT: readonly OutboxStatus[] = ['skipped', 'failed', 'cancelled', 'expired']
const PAGE_SIZE = 50

export function statusesFor(show: ActivityShow): OutboxStatus[] | undefined {
  if (show === 'waiting') return ['queued', 'claimed']
  if (show === 'sent') return ['sent']
  if (show === 'not_sent') return [...NOT_SENT]
  return undefined
}

export function isNotSent(status: OutboxStatus): boolean {
  return NOT_SENT.includes(status)
}

export function activityRequest(input: {
  show: ActivityShow
  from: string | null
  cursor: string | null
  automationIdFor: (recipe: string) => string | null
}): Record<string, unknown> {
  const statuses = statusesFor(input.show)
  const body: Record<string, unknown> = { action: 'activity', limit: PAGE_SIZE }
  if (statuses) body.statuses = statuses
  if (input.cursor) body.cursor = input.cursor
  const from = input.from
  if (from?.startsWith('auto:')) {
    const automationId = input.automationIdFor(from.slice('auto:'.length))
    if (automationId) body.automationId = automationId
  } else if (from?.startsWith('campaign:')) {
    body.includeCampaigns = true
    body.campaignId = from.slice('campaign:'.length)
  } else if (from !== 'automatic') {
    body.includeCampaigns = true
  }
  return body
}

const REASONS: Readonly<Record<string, string>> = {
  no_consent: 'Hasn’t agreed to texts',
  opted_out: 'Opted out of texts',
  suppressed: 'Number is blocked',
  no_phone: 'No phone number',
  guest_changed: 'Guest’s number changed',
  ordered: 'Ordered again before it went out',
  reward_used: 'Used the reward already',
  automation_off: 'Automation was turned off',
  texted_recently: 'Already got a text in the last few days',
  recently_texted: 'Already got a text in the last few days',
  already_sent: 'Already got this text',
  too_soon: 'Got a similar text recently',
  missing_review_link: 'No review link yet',
  cannot_fill: 'Message couldn’t be filled in',
  expired: 'Ran out of time: the phone didn’t send it',
  owner_cancelled: 'You cancelled it',
  unconfirmed: 'The phone didn’t confirm it was sent',
  send_failed: 'The phone couldn’t send it',
  delivery_failed: 'The phone couldn’t send it',
  device_restarted: 'The phone restarted while sending',
  invalid_message: 'The text looked wrong, so it wasn’t sent',
  phone_stopped: 'Sending was switched off',
  campaign_paused: 'You paused the campaign',
  paused: 'You paused the campaign',
}

export function reasonText(reason: string | null): string {
  return (reason && REASONS[reason]) || 'Not sent'
}

/** "Maria S." — first name and an initial, never the whole name. */
export function maskName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Guest'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

/** "Maria S. · ending 4567". */
export function guestLabel(name: string | null, last4: string): string {
  return `${maskName(name)} · ${last4 ? `ending ${last4}` : 'no number'}`
}

export interface DayGroup<T> {
  key: number
  label: string
  items: T[]
}

export function groupByDay<T extends { createdAt: string }>(items: readonly T[], now: number): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const at = toMs(item.createdAt) ?? now
    const key = manilaDay(at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: dayHeaderText(at, now), items: [item] })
  }
  return groups
}

export function emptyActivityText(show: ActivityShow): { title: string; body: string | null } {
  if (show === 'waiting') return { title: 'Nothing waiting', body: null }
  if (show === 'sent') return { title: 'No texts sent yet', body: null }
  if (show === 'not_sent') return { title: 'Every text went out', body: null }
  return { title: 'No texts yet', body: 'When a campaign or an automatic text goes out, each one shows up here.' }
}
