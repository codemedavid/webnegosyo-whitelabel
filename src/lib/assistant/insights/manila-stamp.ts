import { formatManilaTime, manilaDayKey } from '@/lib/activity/format'

/**
 * Times Owl hands the model. The system prompt's "Now" is Asia/Manila, so a
 * fact cut straight from a UTC timestamp (`iso.slice(0, 16)`) reads up to
 * eight hours off — a 7 AM count became "yesterday". Every read tool goes
 * through these two instead.
 */

/** 'YYYY-MM-DD h:mm AM' in Asia/Manila; null for a missing or unreadable time. */
export function manilaStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const day = manilaDayKey(iso)
  return day ? `${day} ${formatManilaTime(iso)}` : null
}

/** 'YYYY-MM-DD' in Asia/Manila; null for a missing or unreadable time. */
export function manilaDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  return manilaDayKey(iso) || null
}
