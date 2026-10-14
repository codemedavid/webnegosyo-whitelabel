/**
 * Which units a unit-limited voucher should land on, as a browser sent it.
 *
 * The picks only ever MOVE a discount between eligible units; the engine
 * re-validates them against the real cart and falls back to the cheapest
 * units when they do not fit. This module only bounds the untrusted shape so
 * a request cannot smuggle a huge object into pricing.
 */

import type { UnitPicks } from './types'

const MAX_CODES = 5
const MAX_LINES_PER_CODE = 200
const MAX_CODE_LENGTH = 64
const MAX_LINE_ID_LENGTH = 128
const MAX_UNITS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Code (upper-cased) → line id → whole units ≥ 1. Anything else is dropped. */
export function sanitizeUnitPicks(raw: unknown): Record<string, UnitPicks> {
  if (!isRecord(raw)) return {}
  const out: Record<string, UnitPicks> = {}
  for (const [code, picks] of Object.entries(raw).slice(0, MAX_CODES)) {
    const key = code.trim().toUpperCase()
    if (key === '' || key.length > MAX_CODE_LENGTH || !isRecord(picks)) continue
    const lines: Record<string, number> = {}
    for (const [lineId, units] of Object.entries(picks).slice(0, MAX_LINES_PER_CODE)) {
      if (lineId === '' || lineId.length > MAX_LINE_ID_LENGTH) continue
      if (typeof units !== 'number' || !Number.isInteger(units) || units < 1 || units > MAX_UNITS) continue
      lines[lineId] = units
    }
    if (Object.keys(lines).length > 0) out[key] = lines
  }
  return out
}
