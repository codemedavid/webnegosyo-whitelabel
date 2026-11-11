/**
 * The value a `<input type="datetime-local">` shows for a stored instant.
 *
 * The input reads and writes the browser's wall clock with no zone, so a stored
 * UTC string cannot be sliced into it: the field would show UTC, and the next
 * edit would parse that as local time and move the instant.
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
