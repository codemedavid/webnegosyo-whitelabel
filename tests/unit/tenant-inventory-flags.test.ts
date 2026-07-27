/**
 * The superadmin tenant form could not turn inventory on.
 *
 * Two defects, one symptom. `tenantSchema` never declared the inventory flags,
 * and a Zod object strips keys it does not declare — so the switches sent their
 * values, the action parsed them away, and the save reported success having
 * written nothing. And `inventory_enabled`, the master flag the whole feature
 * hangs off, had no switch at all: it was SQL-only from the day it shipped.
 *
 * These tests lock down the parse (the silent-drop bug) and the payload wiring
 * at all four write sites. The payload assertions are source-level because the
 * builders live inside DB-calling functions; they are cheap insurance against a
 * fifth site being added without the flags.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { tenantSchema } from '@/lib/tenants-service'

const ROOT = join(__dirname, '..', '..')

/** Minimum a tenant needs to parse; everything else has a schema default. */
const MINIMAL_TENANT = {
  name: 'Test Cafe',
  slug: 'test-cafe',
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123',
}

const INVENTORY_FLAGS = [
  'inventory_enabled',
  'low_stock_alerts_enabled',
  'auto_86_enabled',
] as const

describe('tenantSchema inventory flags', () => {
  it.each(INVENTORY_FLAGS)('carries %s through the parse instead of stripping it', (flag) => {
    // The bug: an undeclared key is silently dropped, so the switch appeared to
    // save and the column never changed.
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, [flag]: true })

    expect(parsed[flag]).toBe(true)
  })

  it.each(INVENTORY_FLAGS)('defaults %s to false when the form omits it', (flag) => {
    // Inventory and auto-86 both change what a live merchant sees; neither may
    // switch itself on for a tenant that never asked.
    const parsed = tenantSchema.parse(MINIMAL_TENANT)

    expect(parsed[flag]).toBe(false)
  })
})

describe('tenant write paths', () => {
  const sources: [string, string][] = [
    ['actions/tenants.ts', readFileSync(join(ROOT, 'src/actions/tenants.ts'), 'utf8')],
    ['lib/tenants-service.ts', readFileSync(join(ROOT, 'src/lib/tenants-service.ts'), 'utf8')],
  ]

  it.each(sources)('%s writes every inventory flag it parses', (_name, source) => {
    // Both files build two payloads (create + update). A flag that reaches the
    // parse but not the payload fails just as silently as one that is stripped.
    for (const flag of INVENTORY_FLAGS) {
      const writes = source.match(new RegExp(`${flag}: parsed\\.${flag}`, 'g')) ?? []
      expect(writes).toHaveLength(2)
    }
  })
})

describe('superadmin tenant form', () => {
  const form = readFileSync(
    join(ROOT, 'src/components/superadmin/tenant-form-wrapper.tsx'),
    'utf8',
  )

  it('offers a switch for the master inventory flag', () => {
    // Without this the alert switches below it govern a feature nobody can
    // reach: the admin route 404s and the sidebar link is hidden.
    expect(form).toMatch(/id="inventory_enabled"/)
  })

  it.each(INVENTORY_FLAGS)('submits %s with the rest of the tenant', (flag) => {
    expect(form).toMatch(new RegExp(`${flag}: formData\\.${flag}`))
  })
})
