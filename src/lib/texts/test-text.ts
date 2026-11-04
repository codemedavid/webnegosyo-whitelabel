/**
 * "Send a test text" on /admin/texts: the rules and the words. Pure.
 *
 * A test text is one `sms_outbox` row (source/recipe/family 'test', no guest)
 * that the store's own phone picks up through the normal claim, so it proves
 * the whole path a real text takes: server → queue → phone → SIM → report.
 * The claim still waits for quiet hours, the daily limit and pacing
 * (migration 20261029131000_sms_test_text.sql).
 */

import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import { countSmsSegments, toSmsSafe } from '@/lib/sms-automations/template'
import { clockText } from './view/time'

/** Test texts per store per Manila day: enough to retry a fix, not a free SMS gateway. */
export const TEST_TEXT_DAILY_LIMIT = 5
/** A test nobody's phone picks up within this window is dropped by the sweep. */
export const TEST_TEXT_EXPIRY_MS = 15 * 60_000
/** The card asks how it went this often, for this long. */
export const TEST_TEXT_POLL_MS = 3_000
export const TEST_TEXT_WATCH_MS = 3 * 60_000
const MAX_STORE_NAME = 40

export const testTextInputSchema = z.strictObject({
  phone: z.string().trim().min(1, 'Type the mobile number to text.').max(32)
    .transform((value) => normalizePhoneE164(value) ?? '')
    .pipe(z.string().regex(/^\+639\d{9}$/, 'Use a Philippine mobile number, like 0917 123 4567.')),
})
export type TestTextInput = z.infer<typeof testTextInputSchema>

/** Short and GSM-7 (one SMS part): a store name the SIM can't encode cleanly is left out. */
export function testTextBody(storeName: string | null): string {
  const safe = toSmsSafe((storeName ?? '').replace(/\s+/g, ' ').trim()).slice(0, MAX_STORE_NAME).trim()
  const from = safe && countSmsSegments(safe).encoding === 'GSM7' ? ` from ${safe}` : ''
  return `Test text${from} via SmartMenu: your sending phone works.`
}

export type TestTextStatus = 'queued' | 'claimed' | 'sent' | 'failed' | 'expired' | 'cancelled' | 'skipped'

export interface TestTextState {
  id: string
  status: TestTextStatus
  /** The phone's error code (`no_service`, `unconfirmed`, …) on a failure. */
  error: string | null
  createdAt: string
  sentAt: string | null
  /** Display name of the phone that took it, once one did. */
  phoneName: string | null
  /** Quiet hours are on now: the phone holds every text, tests included, until this time. */
  quietUntil: string | null
}

const PHONE_ERRORS: Record<string, string> = {
  no_service: 'No mobile signal. Move the phone somewhere with signal.',
  radio_off: 'The phone is in airplane mode. Turn it off.',
  limit_exceeded: 'Android is holding back texts from this app. Wait a few minutes.',
  null_pdu: 'The phone could not build the message.',
  generic_failure: 'The SIM refused it. Check the SIM has load and can send SMS.',
  timeout: 'The SIM never said whether it went out. Check signal and load.',
  no_sms_manager: 'This phone cannot send SMS.',
  phone_stopped: 'The phone stopped sending before it went out.',
  device_restarted: 'The app closed while sending. Open SmartMenu on the phone.',
  unconfirmed: 'The phone took it but never reported back. Open SmartMenu on the phone.',
}
const GENERIC_PHONE_ERROR = 'The SIM refused it. Check signal and load, then try again.'

export type TestTextTone = 'waiting' | 'ok' | 'bad'

export interface TestTextView {
  tone: TestTextTone
  title: string
  body: string | null
  /** Still worth asking the server again. */
  isOpen: boolean
}

/** What the card says. `now` and the times are server-clock ms. */
export function testTextView(state: TestTextState, now: number): TestTextView {
  const phone = state.phoneName ?? 'Your phone'
  switch (state.status) {
    case 'sent': {
      const at = state.sentAt ? Date.parse(state.sentAt) : NaN
      return { tone: 'ok', title: `Sent by ${phone}${Number.isFinite(at) ? ` at ${clockText(at)}` : ''}`, body: 'Check the number you texted. If it arrived, the phone is working.', isOpen: false }
    }
    case 'failed':
      return { tone: 'bad', title: `${phone} couldn't send it`, body: PHONE_ERRORS[state.error ?? ''] ?? GENERIC_PHONE_ERROR, isOpen: false }
    case 'claimed':
      return { tone: 'waiting', title: `${phone} is sending it…`, body: null, isOpen: true }
    case 'queued': {
      const quiet = state.quietUntil ? Date.parse(state.quietUntil) : NaN
      if (Number.isFinite(quiet) && quiet > now) {
        return { tone: 'waiting', title: 'Waiting for quiet hours to end', body: `Texts don't go out during quiet hours. This one goes at ${clockText(quiet)}.`, isOpen: true }
      }
      const age = now - Date.parse(state.createdAt)
      if (Number.isFinite(age) && age > 60_000) {
        return { tone: 'waiting', title: "The phone hasn't picked it up yet", body: 'Is SmartMenu open on the phone with "Use this phone" on? The phone checks for texts about once a minute.', isOpen: true }
      }
      return { tone: 'waiting', title: 'Waiting for the phone to pick it up…', body: 'The phone checks for texts about once a minute.', isOpen: true }
    }
    default:
      return { tone: 'bad', title: 'No phone picked it up', body: 'Open SmartMenu on the phone, check "Use this phone" is on and it has internet, then try again.', isOpen: false }
  }
}
