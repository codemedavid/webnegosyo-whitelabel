/**
 * The composer's Review pane and footer: the sentence at the top, the
 * primary button for the phone's state, and the after-send toast. Pure.
 */

import type { SenderHeroState, WhenChoice } from '../types'
import { presetTitle } from './audience'
import type { AudiencePreset } from '../types'
import { clockText, finishText, sinceText, startText, time12h, toMs } from './time'

export type FooterPhoneState = 'ready' | 'quiet' | 'offline' | 'none'

export function footerPhoneState(hero: SenderHeroState): FooterPhoneState {
  if (hero === 'none') return 'none'
  if (hero === 'resting') return 'quiet'
  if (hero === 'late' || hero === 'offline' || hero === 'unknown') return 'offline'
  return 'ready'
}

function guests(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'guest' : 'guests'}`
}

export function primaryLabel(input: { when: WhenChoice; phone: FooterPhoneState; reach: number; quietUntil: number | null }): string {
  if (input.phone === 'none') return 'Save and schedule'
  if (input.when === 'later') return 'Schedule'
  if (input.when === 'repeat') return 'Start repeating'
  if (input.phone === 'quiet' && input.quietUntil !== null) return `Send at ${clockText(input.quietUntil)}`
  return `Send to ${guests(input.reach)}`
}

export function phoneNote(phone: FooterPhoneState): string | null {
  if (phone === 'offline') return "Your phone is offline. Texts wait until it's back on."
  if (phone === 'none') {
    return "Nothing goes out until you connect a phone. If no phone checks in within a day of the start, we pause it and tell you, so old promos don't go out late."
  }
  return null
}

const AUDIENCE_NOUN: Record<AudiencePreset, string> = {
  everyone: 'guests', lapsed: 'guests who haven’t been back', regulars: 'regulars', first_timers: 'first-timers',
  recent: 'recent guests', custom: 'guests',
}

/** The phone is late, offline or missing: nothing can be promised by the clock. */
export function isPhoneAway(phone: FooterPhoneState): boolean {
  return phone === 'offline' || phone === 'none'
}

/** "Texts wait until Juan's Galaxy A15 checks in (last seen 2:14 PM)." */
export function waitText(phoneName: string | null, lastSeenAt: string | null, now: number): string {
  const seen = toMs(lastSeenAt)
  const who = phoneName ?? 'your phone'
  return seen === null ? `Texts wait until ${who} checks in.` : `Texts wait until ${who} checks in (last seen ${sinceText(seen, now)}).`
}

/** "Text 148 regulars now, from Juan's Galaxy A15." / no phone: "Save a text for 148 regulars. …" */
export function reviewHeading(input: {
  reach: number; preset: AudiencePreset; when: WhenChoice; startAt: number; now: number; phoneName: string | null; repeatLabel: string
  phone?: FooterPhoneState
}): string {
  const who = `${input.reach.toLocaleString('en-US')} ${input.reach === 1 && input.preset === 'everyone' ? 'guest' : AUDIENCE_NOUN[input.preset]}`
  if (input.phone === 'none') return `Save a text for ${who}. It goes out once you connect a phone.`
  const when = input.when === 'now' ? 'now' : input.when === 'later' ? startText(input.startAt, input.now) : input.repeatLabel
  const from = input.phoneName ? `, from ${input.phoneName}` : ''
  return `Text ${who} ${when === 'now' ? 'now' : when}${from}.`
}

/** "Every Fri, 10:00 AM" / "Every 14 days, 10:00 AM". */
export function repeatLabel(kind: 'weekly' | 'every_n_days', weekdays: number[], intervalDays: number, time: string): string {
  const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  if (kind === 'weekly') return `every ${[...weekdays].sort((a, b) => a - b).map((d) => names[d]).join(', ')}, ${time12h(time)}`
  return `every ${intervalDays === 1 ? 'day' : `${intervalDays} days`}, ${time12h(time)}`
}

/** "Saved. Still scheduled for Fri, 10:00 AM." — saving a live campaign keeps it live. */
export function savedChangesToast(input: { displayState: string; when: WhenChoice; startAt: number; now: number; repeat: string }): string {
  if (input.displayState === 'scheduled' && input.when === 'later') return `Saved. Still scheduled for ${startText(input.startAt, input.now)}.`
  if (input.displayState === 'scheduled' || input.displayState === 'repeating') {
    return input.when === 'repeat' ? `Saved. Still repeating ${input.repeat}.` : 'Saved. Still scheduled.'
  }
  return 'Saved.'
}

export function audienceSummary(preset: AudiencePreset, reach: number, skipped: number): string {
  const parts = [`${presetTitle(preset)} · ${guests(reach)}`]
  if (skipped > 0) parts.push(`(${skipped.toLocaleString('en-US')} skipped)`)
  return parts.join(' ')
}

export function afterSendToast(input: {
  when: WhenChoice; phone: FooterPhoneState; queued: number; finishAt: number | null; startAt: number; now: number; repeat: string
}): string {
  if (input.phone === 'none') return 'Saved. It goes out once your phone connects.'
  if (input.when === 'now' && input.phone === 'offline') return `Queued for ${guests(input.queued)}. They go out once your phone is back.`
  if (input.when === 'now') {
    const done = input.finishAt !== null ? ` Done ${finishText(input.finishAt, input.now)}.` : ''
    return `Sending to ${guests(input.queued)}.${done}`
  }
  if (input.when === 'later') return `Scheduled for ${startText(input.startAt, input.now)}.`
  return `Repeating ${input.repeat}.`
}
