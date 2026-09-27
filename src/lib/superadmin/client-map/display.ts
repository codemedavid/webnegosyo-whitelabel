/** Display helpers for the superadmin Client Map. Pure. */

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_PER_MONTH = 30.44
const MONTHS_PER_YEAR = 12
const COUNTRY = /^philippines$/i
const POSTAL_CODE = /^\d{4}$/

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** "Balayan, Batangas" from a full typed address — the last two meaningful parts. */
export function shortLocality(address: string | null): string | null {
  if (!address) return null
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !COUNTRY.test(part) && !POSTAL_CODE.test(part))
    .filter((part, index, all) => index === 0 || part.toLowerCase() !== all[index - 1].toLowerCase())
  if (parts.length === 0) return null
  return parts.slice(-2).join(', ')
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

/** How long a store has been a client: "4 days", "3 months", "2 years". */
export function formatClientTenure(createdAt: string, now: Date): string | null {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return null

  const days = Math.floor((now.getTime() - created) / DAY_MS)
  if (days < 1) return 'Joined today'
  const months = Math.floor(days / DAYS_PER_MONTH)
  if (months < 1) return plural(days, 'day')
  if (months < MONTHS_PER_YEAR) return plural(months, 'month')
  return plural(Math.floor(months / MONTHS_PER_YEAR), 'year')
}
