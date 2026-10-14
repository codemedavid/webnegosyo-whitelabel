/**
 * "Needs attention" on /admin/texts. Pure.
 *
 * Copy and order are ux-spec C.4: urgent before warnings, then the spec's
 * order. Everything is returned; the strip decides how many to show. Links
 * are relative (`?phones=1`, …) so they open sheets on the same page.
 */

import type { AttentionItem, CampaignListItem, SenderSummary, SendingPhone } from './types'

/** A failure spike needs at least this many failed texts today … */
export const FAILURE_SPIKE_MIN = 5
/** … and at least this share of today's attempts. */
export const FAILURE_SPIKE_SHARE = 0.3
/** A campaign this close to starting with the phone offline is worth a row. */
export const STARTS_SOON_MS = 24 * 3_600_000
const MANILA_OFFSET_MS = 8 * 3_600_000
const DAY_MS = 86_400_000

export type AttentionCampaign = Pick<CampaignListItem, 'id' | 'name' | 'status' | 'displayState' | 'pauseReason' | 'nextSendAt'>

export interface AttentionInput {
  now: Date
  sender: SenderSummary
  campaigns: readonly AttentionCampaign[]
  /** Scheduled campaigns whose audience is empty right now. */
  emptyAudienceCampaignIds: readonly string[]
  /** Review request is on and the store has no review link. */
  isReviewLinkMissing: boolean
}

type Kind = AttentionItem['kind']
const KIND_ORDER: readonly Kind[] = [
  'waiting_no_phone', 'campaign_paused_itself', 'failure_spike', 'starts_soon_offline',
  'campaign_no_one', 'review_link_missing', 'phone_needs_fix',
]
const UPCOMING_STATES: ReadonlySet<string> = new Set(['scheduled', 'repeating'])
const PHONES_HREF = '?phones=1'

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)
const campaignHref = (id: string) => `?campaign=${encodeURIComponent(id)}`

function manilaParts(instant: Date): { day: number; hour: number; minute: number } {
  const shifted = instant.getTime() + MANILA_OFFSET_MS
  const minuteOfDay = Math.floor((shifted % DAY_MS) / 60_000)
  return { day: Math.floor(shifted / DAY_MS), hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 }
}

/** "2:00 PM" / "tomorrow at 9:00 AM", Manila wall clock (no Intl: its spaces vary by ICU). */
function startsAtLabel(at: Date, now: Date): string {
  const { day, hour, minute } = manilaParts(at)
  const clock = `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
  return day === manilaParts(now).day ? `at ${clock}` : `tomorrow at ${clock}`
}

function waitingItems({ sender }: AttentionInput): AttentionItem[] {
  if (sender.waiting <= 0 || (sender.heroState !== 'none' && sender.heroState !== 'offline')) return []
  const text = `${sender.waiting} ${plural(sender.waiting, 'text is', 'texts are')} waiting for your phone.`
  return [{ id: 'waiting_no_phone', kind: 'waiting_no_phone', severity: 'urgent', text, action: { label: 'Fix it', href: PHONES_HREF } }]
}

function pausedItems({ campaigns }: AttentionInput): AttentionItem[] {
  return campaigns
    .filter((c) => c.status === 'paused' && c.pauseReason === 'missed_no_phone')
    .map((c) => ({
      id: `campaign_paused_itself:${c.id}`, kind: 'campaign_paused_itself', severity: 'urgent',
      text: `${c.name} paused: no phone checked in for a day.`, action: { label: 'Review', href: campaignHref(c.id) },
    }))
}

function failureItems({ sender }: AttentionInput): AttentionItem[] {
  const failed = sender.phones.reduce((sum, p) => sum + p.failedToday, 0)
  const attempts = sender.phones.reduce((sum, p) => sum + p.failedToday + p.sentToday, 0)
  if (failed < FAILURE_SPIKE_MIN || failed < attempts * FAILURE_SPIKE_SHARE) return []
  return [{
    id: 'failure_spike', kind: 'failure_spike', severity: 'urgent',
    text: `${failed} texts couldn't send today. The SIM may be out of load or blocked.`,
    action: { label: 'See which', href: '?tab=activity&show=not_sent' },
  }]
}

function startsSoonItems({ sender, campaigns, now }: AttentionInput): AttentionItem[] {
  if (sender.heroState !== 'offline') return []
  return campaigns.flatMap((c) => {
    const at = c.nextSendAt ? new Date(c.nextSendAt) : null
    const ms = at ? at.getTime() - now.getTime() : Number.NaN
    if (!at || !UPCOMING_STATES.has(c.displayState) || !(ms >= 0 && ms <= STARTS_SOON_MS)) return []
    return [{
      id: `starts_soon_offline:${c.id}`, kind: 'starts_soon_offline' as const, severity: 'urgent' as const,
      text: `${c.name} starts ${startsAtLabel(at, now)} and your phone is offline.`, action: { label: 'Fix it', href: PHONES_HREF },
    }]
  })
}

function emptyAudienceItems({ campaigns, emptyAudienceCampaignIds }: AttentionInput): AttentionItem[] {
  const empty = new Set(emptyAudienceCampaignIds)
  return campaigns
    .filter((c) => empty.has(c.id) && UPCOMING_STATES.has(c.displayState))
    .map((c) => ({
      id: `campaign_no_one:${c.id}`, kind: 'campaign_no_one', severity: 'warn',
      text: `No one matches ${c.name} right now.`, action: { label: 'Edit', href: `${campaignHref(c.id)}&edit=1` },
    }))
}

function reviewLinkItems({ isReviewLinkMissing }: AttentionInput): AttentionItem[] {
  if (!isReviewLinkMissing) return []
  return [{
    id: 'review_link_missing', kind: 'review_link_missing', severity: 'warn',
    text: 'Review request needs your review link.', action: { label: 'Add link', href: '?tab=rules&focus=review_link' },
  }]
}

function phoneFix(p: SendingPhone): AttentionItem | null {
  const action = { label: 'Phones', href: `${PHONES_HREF}&phone=${encodeURIComponent(p.deviceId)}` }
  const id = `phone_needs_fix:${p.deviceId}`
  if (p.smsPermission === false) {
    return { id, kind: 'phone_needs_fix', severity: 'urgent', text: `${p.name} can't send: SMS permission is off.`, action }
  }
  if (p.isAppOld) return { id, kind: 'phone_needs_fix', severity: 'warn', text: `${p.name} needs an app update.`, action }
  return null
}

function phoneItems({ sender }: AttentionInput): AttentionItem[] {
  return sender.phones.map(phoneFix).filter((item): item is AttentionItem => item !== null)
}

const SEVERITY_RANK = { urgent: 0, warn: 1 } as const

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items = [
    waitingItems, pausedItems, failureItems, startsSoonItems, emptyAudienceItems, reviewLinkItems, phoneItems,
  ].flatMap((build) => build(input))
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity]
      || KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind)
      || a.index - b.index)
    .map(({ item }) => item)
}

/** Rows that only repeat what an offline / no-phone hero already says. */
const HERO_DUPLICATES: ReadonlySet<Kind> = new Set(['waiting_no_phone', 'starts_soon_offline'])

/**
 * The strip under the hero drops rows the hero already says ("Offline · 34
 * texts waiting" twice reads as two problems). Pass the hero state shown.
 */
export function withoutHeroDuplicates(items: readonly AttentionItem[], heroState: SenderSummary['heroState']): AttentionItem[] {
  if (heroState !== 'offline' && heroState !== 'none') return [...items]
  return items.filter((item) => !HERO_DUPLICATES.has(item.kind))
}
