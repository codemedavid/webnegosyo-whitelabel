/**
 * Formatting and the two chart colour roles shared by the admin dashboard's
 * server and client components. Plain module (no 'use client') so both sides
 * can import it. Per-metric colours live in `metric-style.ts`.
 */

/** "This period" in charts without a metric of their own (busiest hours). */
export const SERIES_CURRENT = '#E4572E'
/** The comparison window's dashed line. */
export const SERIES_PREVIOUS = '#B8B2A7'

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const PESO_CENTS = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 })
const PESO_COMPACT = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const COUNT = new Intl.NumberFormat('en-PH')

export function formatPeso(value: number): string {
  return Math.abs(value) < 1000 && !Number.isInteger(value) ? PESO_CENTS.format(value) : PESO.format(value)
}

export function formatPesoCompact(value: number): string {
  return Math.abs(value) >= 10_000 ? PESO_COMPACT.format(value) : PESO.format(value)
}

export function formatCount(value: number): string {
  return COUNT.format(Math.round(value))
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}
