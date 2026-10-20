/**
 * When will the last of N waiting texts go out? Pure.
 *
 * A copy of the web's src/lib/sms-automations/eta.ts + quiet-hours.ts (the two
 * packages share no build). The server answers this for the queue as it is
 * now (`outlook.finishAt`); the app needs it for the queue as it WOULD be once
 * the owner says "text them now too", before anything is queued. Keep the
 * limits in step with the claim RPC: one phone sends at most `PER_WINDOW`
 * texts per `WINDOW_MINUTES`, never in quiet hours, and stops at the daily
 * limit until Manila midnight. Assumes the phone stays on — the sheet says so.
 */

export const PER_WINDOW = 25;
export const WINDOW_MINUTES = 30;
const MINUTE_MS = 60_000;
const MANILA_OFFSET_MINUTES = 8 * 60;
const MANILA_OFFSET_MS = MANILA_OFFSET_MINUTES * MINUTE_MS;
const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = MINUTES_PER_DAY * MINUTE_MS;
/** Past this the answer is "a long time" — the UI says so instead of a date. */
const HORIZON_DAYS = 14;

export interface DeliveryRules {
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyLimit: number;
}

function toMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function manilaMinuteOfDay(at: number): number {
  const total = Math.floor(at / MINUTE_MS) + MANILA_OFFSET_MINUTES;
  return ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function isQuietAt(at: number, start: string, end: string): boolean {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null || from === to) return false;
  const minute = manilaMinuteOfDay(at);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** `at` itself, or the end of the quiet window it falls in. */
function nextSendableAt(at: number, start: string, end: string): number {
  if (!isQuietAt(at, start, end)) return at;
  const to = toMinutes(end) as number;
  const wait = (((to - manilaMinuteOfDay(at)) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return Math.floor(at / MINUTE_MS) * MINUTE_MS + wait * MINUTE_MS;
}

function manilaDay(at: number): number {
  return Math.floor((at + MANILA_OFFSET_MS) / DAY_MS);
}

function nextManilaMidnight(at: number): number {
  return (manilaDay(at) + 1) * DAY_MS - MANILA_OFFSET_MS;
}

export interface EtaInput {
  waiting: number;
  /** Texts already sent today (Manila), counted against the daily limit. */
  sentToday: number;
  now: number;
  rules: DeliveryRules;
}

/** The instant the last batch starts sending (epoch ms), or null beyond two weeks. */
export function estimateDeliveryFinish({ waiting, sentToday, now, rules }: EtaInput): number | null {
  let remaining = Math.max(0, Math.floor(waiting));
  if (remaining === 0) return now;
  const horizon = now + HORIZON_DAYS * DAY_MS;
  let at = now;
  let day = manilaDay(now);
  let leftToday = Math.max(0, rules.dailyLimit - sentToday);

  while (at <= horizon) {
    at = nextSendableAt(at, rules.quietHoursStart, rules.quietHoursEnd);
    if (manilaDay(at) !== day) {
      day = manilaDay(at);
      leftToday = rules.dailyLimit;
    }
    if (leftToday <= 0) {
      at = nextManilaMidnight(at);
      continue;
    }
    const batch = Math.min(PER_WINDOW, remaining, leftToday);
    remaining -= batch;
    leftToday -= batch;
    if (remaining === 0) return at <= horizon ? at : null;
    at += WINDOW_MINUTES * MINUTE_MS;
  }
  return null;
}
