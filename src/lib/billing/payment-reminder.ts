/**
 * The message the platform owner pastes into Messenger or SMS to ask a client
 * for their subscription payment. Pure, so the wording is tested once and the
 * calendar only copies it.
 */

import type { CalendarEntry } from '@/lib/billing/collections-calendar'

/** A `YYYY-MM-DD` as "Oct 9, 2026", in UTC so it cannot drift a day. */
export function formatDueDay(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function peso(value: number): string {
  return `₱${value.toLocaleString('en-PH')}`
}

export function buildPaymentReminder(entry: CalendarEntry): string {
  const amount = peso(entry.amountPhp)
  const greeting = `Hi ${entry.name}!`
  const closing = 'You can reply here once paid and we will update your account. Salamat po!'

  if (entry.kind === 'never_billed' || !entry.dueDayKey) {
    return `${greeting} Your WebNegosyo monthly subscription is ${amount}/month. Could you send your first payment so we can activate your billing? ${closing}`
  }

  const date = formatDueDay(entry.dueDayKey)
  const what = entry.isFirstPayment
    ? `your first WebNegosyo monthly payment of ${amount}`
    : `your WebNegosyo monthly subscription of ${amount}`

  if (entry.kind === 'overdue') {
    return `${greeting} A friendly reminder that ${what} was due on ${date}. ${closing}`
  }
  if (entry.kind === 'due_today') {
    return `${greeting} A friendly reminder that ${what} is due today (${date}). ${closing}`
  }
  return `${greeting} A friendly reminder that ${what} is due on ${date}. ${closing}`
}
