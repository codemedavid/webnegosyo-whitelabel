/**
 * cash.tenant_order_backend (supabase/migrations/20261027120200_cash_settings.sql)
 * is the SQL twin of resolveOrderBackend (src/lib/order-backend.ts): the
 * shift-sales and day-close RPCs route on it, so a platform store can never be
 * answered "unavailable" (or a Convex store read from the empty platform DB)
 * because the two disagree. Every pin × URL combination, both sides.
 *
 * PGlite runs in a plain Node worker (tests/sql/cash-order-backend-worker.cjs):
 * Jest cannot load its wasm.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveOrderBackend, type OrderBackendPreference } from '@/lib/order-backend'

const WORKER = path.join(process.cwd(), 'tests/sql/cash-order-backend-worker.cjs')

// Pins as stored: every recognised value, `auto`, nothing, and values a hand
// edit or an old row could hold (case matters on both sides).
const PINS: Array<string | null> = [null, 'auto', 'platform', 'convex', 'supabase', '', 'Convex', 'PLATFORM', ' convex', 'bogus']
// JS String.prototype.trim() whitespace (ASCII, NBSP, Unicode spaces, line
// separators, BOM), plus real URLs with and without padding.
const URLS: Array<string | null> = [
  null, '', ' ', '\t\n\r', '\u000b\f', ' ', ' ', '  ', '  ', '  　', '﻿',
  '​', // zero-width space is NOT trim() whitespace: a "URL" of it counts as present
  'https://happy-otter-123.convex.cloud', '  https://x.convex.cloud  ', ' https://x.convex.cloud', 'x',
]

interface Case { order_backend: string | null; convex_deployment_url: string | null }

describe('cash.tenant_order_backend matches resolveOrderBackend', () => {
  it('agrees on every pin × deployment URL combination', () => {
    const cases: Case[] = PINS.flatMap((pin) => URLS.map((url) => ({ order_backend: pin, convex_deployment_url: url })))
    const dir = mkdtempSync(path.join(tmpdir(), 'cash-backend-'))
    try {
      const file = path.join(dir, 'cases.json')
      writeFileSync(file, JSON.stringify(cases))
      const output = execFileSync(process.execPath, [WORKER, file], { cwd: process.cwd(), encoding: 'utf8' })
      const { results } = JSON.parse(output) as { results: string[] }
      const mismatches = cases
        .map((row, index) => ({
          row,
          sql: results[index],
          ts: resolveOrderBackend({
            order_backend: row.order_backend as OrderBackendPreference | null,
            convex_deployment_url: row.convex_deployment_url,
          }),
        }))
        .filter(({ sql, ts }) => sql !== ts)
      expect(results).toHaveLength(cases.length)
      expect(mismatches).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
