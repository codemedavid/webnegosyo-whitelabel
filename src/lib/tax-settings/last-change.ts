/**
 * "Last changed by Ana on 12 Oct 2026, 3:04 PM" — the line under the page
 * title. Dates are shown in Manila time, the store's legal day.
 */

export interface TaxProfileLastChange {
  changedAt: string
  /** Null when the change log is not readable by this viewer. */
  changedBy: string | null
  /** The changer's display name, when it could be looked up. */
  changerName: string | null
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function describeLastChange(
  change: TaxProfileLastChange | null,
  viewerUserId: string | null,
): string | null {
  if (!change) return null
  const when = new Date(change.changedAt)
  if (Number.isNaN(when.getTime())) return null
  const date = DATE_FORMAT.format(when)

  if (change.changedBy && change.changedBy === viewerUserId) return `Last changed by you on ${date}`
  if (change.changerName) return `Last changed by ${change.changerName} on ${date}`
  return `Last changed on ${date}`
}
