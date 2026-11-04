/**
 * The phone hero: one state word, one sentence, one fix. Built from the
 * server's SenderSummary (its clock, never the browser's). Pure.
 */

import type { SenderHeroState, SenderSummary } from '../types'
import type { ChipTone } from './chips'
import { clockText, finishText, sinceText, timeAgoText, toMs } from './time'

export type HeroActionKind = 'phones' | 'connect' | 'fix' | 'campaign' | 'retry'

export interface HeroAction {
  label: string
  kind: HeroActionKind
  campaignId?: string
}

export interface HeroView {
  state: SenderHeroState
  word: string
  sentence: string
  tone: ChipTone
  icon: 'phone' | 'moon'
  action: HeroAction
  subLine: string | null
  meter: { sent: number; limit: number; text: string }
}

const PHONES: HeroAction = { label: 'Phones', kind: 'phones' }
const MINUTE_MS = 60_000

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function phoneName(summary: SenderSummary): string {
  return summary.primary?.name ?? 'Your phone'
}

function readySentence(summary: SenderSummary, now: number): string {
  const seen = timeAgoText(summary.primary?.lastSeenAt ?? null, now)
  const lead = seen ? `${phoneName(summary)} checked in ${seen}` : `${phoneName(summary)} is ready`
  // "Ready" alone read as "texts are going out"; say plainly when there is nothing to send.
  if (summary.waiting <= 0) return `${lead} · Nothing waiting to send`
  const allOut = toMs(summary.allOutBy)
  const parts = [lead, `${summary.waiting} waiting`]
  if (allOut !== null) parts.push(`all out by ${clockText(allOut)}`)
  return parts.join(' · ')
}

function lateSentence(summary: SenderSummary, now: number): string {
  const seen = toMs(summary.primary?.lastSeenAt ?? null)
  const minutes = seen === null ? null : Math.max(1, Math.floor((now - seen) / MINUTE_MS))
  const gap = minutes === null ? 'a while' : `${minutes} min`
  return `Haven't heard from ${phoneName(summary)} in ${gap}. Texts keep waiting until it checks in.`
}

function offlineSentence(summary: SenderSummary, now: number): string {
  const seen = toMs(summary.primary?.lastSeenAt ?? null)
  // The chip already says "Offline": name the phone and when it was last heard from.
  const lead = seen === null
    ? `${phoneName(summary)} hasn't checked in yet`
    : `${phoneName(summary)} last checked in ${sinceText(seen, now)}`
  const waiting = summary.waiting > 0 ? ` · ${plural(summary.waiting, 'text', 'texts')} waiting` : ''
  return `${lead}${waiting}. Open SmartMenu on the phone and keep battery saver off.`
}

function restingSentence(summary: SenderSummary): string {
  const until = toMs(summary.quietUntil)
  const lead = until === null ? 'Quiet hours now, Philippine time.' : `Quiet hours until ${clockText(until)}, Philippine time.`
  if (summary.waiting <= 0) return `${lead} Nothing waiting to send.`
  return `${lead} ${plural(summary.waiting, 'text goes', 'texts go')} out then.`
}

function sendingSentence(summary: SenderSummary, now: number): string {
  const sending = summary.sending
  if (!sending) return readySentence(summary, now)
  const finish = toMs(sending.finishAt)
  const parts = [sending.name, `${sending.sent} of ${sending.total} sent`]
  if (finish !== null) parts.push(`done ${finishText(finish, now)}`)
  return parts.join(' · ')
}

function subLineFor(summary: SenderSummary, isDemo: boolean): string | null {
  if (isDemo) return 'Demo store · nothing is really sent'
  if (summary.phones.length < 2) return null
  const primaryId = summary.primary?.deviceId
  const troubled = summary.phones
    .filter((p) => p.deviceId !== primaryId && (p.state === 'offline' || p.state === 'late' || p.state === 'never'))
    .map((p) => `${p.name} ${p.state === 'late' ? 'late' : 'offline'}`)
  return [`${summary.phones.length} phones`, ...troubled].join(' · ')
}

export function heroView(summary: SenderSummary, isDemo: boolean): HeroView {
  const now = toMs(summary.now) ?? Date.now()
  const base = {
    state: summary.heroState,
    icon: 'phone' as const,
    subLine: subLineFor(summary, isDemo),
    meter: {
      sent: summary.sentToday,
      limit: summary.dailyLimit,
      text: `Sent today ${summary.sentToday} of ${summary.dailyLimit}`,
    },
  }
  switch (summary.heroState) {
    case 'none':
      return {
        ...base, word: 'No phone yet', tone: 'grey', action: { label: 'How to connect', kind: 'connect' },
        sentence: 'Texts go out from your own Android phone. Until you connect one, you can write and schedule campaigns, but nothing is sent.',
      }
    case 'ready':
      return { ...base, word: 'Ready', tone: 'emerald', action: PHONES, sentence: readySentence(summary, now) }
    case 'sending':
      return {
        ...base, word: 'Sending', tone: 'emerald', sentence: sendingSentence(summary, now),
        action: summary.sending ? { label: 'View', kind: 'campaign', campaignId: summary.sending.id } : PHONES,
      }
    case 'late':
      return { ...base, word: 'Checking in late', tone: 'amber', action: PHONES, sentence: lateSentence(summary, now) }
    case 'offline':
      return {
        ...base, word: 'Offline', tone: summary.waiting > 0 ? 'red' : 'amber',
        action: { label: 'Fix it', kind: 'fix' }, sentence: offlineSentence(summary, now),
      }
    case 'resting':
      return { ...base, word: 'Resting', tone: 'amber', icon: 'moon', action: PHONES, sentence: restingSentence(summary) }
    default:
      return {
        ...base, word: "Can't check", tone: 'grey', action: { label: 'Try again', kind: 'retry' },
        sentence: "We couldn't check your phone just now.",
      }
  }
}
