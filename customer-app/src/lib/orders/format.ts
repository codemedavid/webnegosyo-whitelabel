const DAY_MS = 24 * 60 * 60 * 1000

const dayKey = (date: Date, timeZone: string | undefined) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

/** "10:25 AM". `timeZone` defaults to the phone's; tests pin Manila. */
export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** "Today, 10:10 AM", "Yesterday, 10:10 AM", or "Sep 20, 10:10 AM" — days counted on the local clock. */
export function formatOrderDate(iso: string, now: Date, timeZone?: string): string {
  const placed = new Date(iso)
  const time = formatTime(iso, timeZone)
  const placedDay = dayKey(placed, timeZone)
  if (placedDay === dayKey(now, timeZone)) return `Today, ${time}`
  if (placedDay === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) return `Yesterday, ${time}`
  const date = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(placed)
  return `${date}, ${time}`
}
