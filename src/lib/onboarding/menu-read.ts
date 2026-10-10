/**
 * Reading the menu WHILE the owner is still answering questions.
 *
 * The wizard starts the read when it leaves the menu step; a few questions
 * later the owner taps their best sellers from their own dishes instead of
 * typing them, and the build reuses the same read instead of waiting for
 * another one. The read is keyed by its sources (photo URLs + typed text): a
 * changed photo or edited text is a different key, so a stale read is never
 * used. Pure; the I/O lives in `menu-read-run.ts`.
 */

import { createHash } from 'crypto'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

/** A read still "reading" after this long died with its function; another may start. */
export const MENU_READ_STALE_MS = 4 * 60 * 1000
/** Reads one set-up may start: photos change, but the AI is not free. */
export const MAX_MENU_READS = 8
/** Dishes handed to the best-seller screen; a long menu still fits a phone. */
export const MAX_READ_DISHES = 60

export interface MenuReadRecord {
  key: string
  status: 'reading' | 'done' | 'failed'
  startedAt: string
  parsed?: ParsedMenuData | null
}

export interface MenuReadDish {
  name: string
  price: number
  category: string
}

export interface MenuReadView {
  status: 'idle' | 'reading' | 'done' | 'failed'
  dishes: MenuReadDish[]
}

export function menuReadKey(imageUrls: readonly string[], menuText: string | null | undefined): string {
  return createHash('sha256').update(JSON.stringify([[...imageUrls], (menuText ?? '').trim()])).digest('hex')
}

export function hasMenuSources(imageUrls: readonly string[], menuText: string | null | undefined): boolean {
  return imageUrls.length > 0 || (menuText ?? '').trim().length > 0
}

function isFresh(record: MenuReadRecord, nowMs: number): boolean {
  const started = Date.parse(record.startedAt)
  return Number.isFinite(started) && nowMs - started < MENU_READ_STALE_MS
}

/** Start a read only when none for these sources is done or still running. */
export function shouldStartMenuRead(record: MenuReadRecord | null | undefined, key: string, nowMs: number): boolean {
  if (!record || record.key !== key) return true
  if (record.status === 'done') return false
  if (record.status === 'reading') return !isFresh(record, nowMs)
  return false
}

/** Dishes worth tapping: named, priced above ₱0 (a ₱0 "Garlic Rice" is no best seller). */
export function dishesOf(parsed: ParsedMenuData | null | undefined): MenuReadDish[] {
  const seen = new Set<string>()
  return (parsed?.items ?? [])
    .filter((item) => typeof item.name === 'string' && item.name.trim() && Number(item.price) > 0)
    .filter((item) => {
      const folded = item.name.trim().toLowerCase()
      if (seen.has(folded)) return false
      seen.add(folded)
      return true
    })
    .slice(0, MAX_READ_DISHES)
    .map((item) => ({ name: item.name.trim(), price: Number(item.price), category: item.category?.trim() || 'Menu' }))
}

export function menuReadView(record: MenuReadRecord | null | undefined, key: string, nowMs: number): MenuReadView {
  if (!record || record.key !== key) return { status: 'idle', dishes: [] }
  if (record.status === 'done') return { status: 'done', dishes: dishesOf(record.parsed) }
  if (record.status === 'reading') return { status: isFresh(record, nowMs) ? 'reading' : 'failed', dishes: [] }
  return { status: 'failed', dishes: [] }
}

/** The build's shortcut: the finished read of exactly these sources, or null. */
export function usableMenuRead(record: MenuReadRecord | null | undefined, key: string): ParsedMenuData | null {
  if (!record || record.key !== key || record.status !== 'done') return null
  const parsed = record.parsed
  return parsed && Array.isArray(parsed.items) && parsed.items.length > 0 && Array.isArray(parsed.categories) ? parsed : null
}
