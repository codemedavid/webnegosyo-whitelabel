/** Cell helpers shared by every sheet. Pure. */

import type { ExportCell, ExportCellKind, TypedCell } from './types'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/** Centavos → pesos for a money cell. Null stays blank (blank ≠ 0). */
export function pesos(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null
  const value = Math.round(cents) / 100
  return Object.is(value, -0) ? 0 : value
}

export function typed(value: number | null | undefined, kind: ExportCellKind): TypedCell {
  return { value: value === undefined || value === null || !Number.isFinite(value) ? null : value, kind }
}

export function isTypedCell(cell: ExportCell): cell is TypedCell {
  return typeof cell === 'object' && cell !== null
}

function manilaIso(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString()
}

/** `2026-11-14` on the Manila wall clock (the Philippines has no daylight saving). */
export function manilaDate(ms: number): string {
  return manilaIso(ms).slice(0, 10)
}

/** `15:02` on the Manila wall clock. */
export function manilaTime(ms: number): string {
  return manilaIso(ms).slice(11, 16)
}

export function manilaDateTime(ms: number): string {
  return `${manilaDate(ms)} ${manilaTime(ms)}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** The weekday of a `YYYY-MM-DD` day key. */
export function weekdayOf(dayKey: string): string {
  const ms = Date.parse(`${dayKey}T00:00:00Z`)
  return Number.isNaN(ms) ? '' : WEEKDAYS[new Date(ms).getUTCDay()]
}

/** Trimmed text, or blank. */
export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** `pending_payment` → `Pending payment`. */
export function words(value: string | null | undefined): string | null {
  const raw = text(value)
  if (!raw) return null
  const spaced = raw.replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
