/**
 * Formatting for store activity: pesos, quantities, Asia/Manila time.
 *
 * Hand-rolled on purpose (no Intl): the merchant app runs on Hermes, where
 * Intl time zones are not guaranteed, and the Philippines has no DST, so
 * Manila is a fixed UTC+8. Same output on every runtime.
 *
 * Kept byte-identical in webnegosyo-app/lib/activity/format.ts (parity test).
 */

const MINUS = '−'
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Absolute amount: '₱185', '₱1,234.50' (zero centavos dropped). */
function pesoDigits(amount: number): string {
  const centavos = Math.round(Math.abs(amount) * 100)
  const whole = Math.floor(centavos / 100)
  const cents = centavos % 100
  const base = `₱${groupThousands(String(whole))}`
  return cents === 0 ? base : `${base}.${String(cents).padStart(2, '0')}`
}

function isZeroPesos(amount: number): boolean {
  return Math.round(Math.abs(amount) * 100) === 0
}

/** '₱185', '₱1,234.50', '−₱185' (never '₱-185.00'). */
export function formatPeso(amount: number): string {
  if (isZeroPesos(amount)) return '₱0'
  return amount < 0 ? `${MINUS}${pesoDigits(amount)}` : pesoDigits(amount)
}

/** '−₱185' for money out (U+2212), '+₱10' for money in, '₱0' for nothing. */
export function formatSignedPeso(amount: number): string {
  if (isZeroPesos(amount)) return '₱0'
  return `${amount < 0 ? MINUS : '+'}${pesoDigits(amount)}`
}

/** 7.600 → '7.6', 2 → '2' (at most 3 decimals). */
export function formatQuantity(quantity: number): string {
  const rounded = Math.round(quantity * 1000) / 1000
  return String(rounded)
}

function manilaParts(iso: string): Date | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  // A Date whose UTC fields read as Manila wall-clock time.
  return new Date(ms + MANILA_OFFSET_MS)
}

/** '12:33 PM' in Asia/Manila; '' for an unreadable time. */
export function formatManilaTime(iso: string): string {
  const local = manilaParts(iso)
  if (!local) return ''
  const hours = local.getUTCHours()
  const minutes = String(local.getUTCMinutes()).padStart(2, '0')
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${minutes} ${suffix}`
}

/** The Asia/Manila calendar day, 'YYYY-MM-DD'; '' for an unreadable time. */
export function manilaDayKey(iso: string): string {
  const local = manilaParts(iso)
  if (!local) return ''
  return local.toISOString().slice(0, 10)
}

/** 'Today', 'Yesterday', else 'Mon 6 Oct' (Asia/Manila days). */
export function formatManilaDay(iso: string, nowIso: string): string {
  const local = manilaParts(iso)
  const today = manilaDayKey(nowIso)
  if (!local || !today) return ''
  const key = local.toISOString().slice(0, 10)
  if (key === today) return 'Today'
  const yesterday = new Date(Date.parse(`${today}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10)
  if (key === yesterday) return 'Yesterday'
  return `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}`
}
