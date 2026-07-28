import { describe, it, expect } from '@jest/globals'
import { tenantSchema } from '@/lib/tenants-service'

/**
 * The superadmin "Enable Branches" toggle must actually save.
 *
 * Reported from production: flipping the switch appears to work, the form
 * submits, "Tenant updated!" is shown — and `multi_branch_enabled` is still
 * false in the database.
 *
 * The cause is that `tenantSchema.parse()` runs on the way in, and Zod object
 * schemas **strip keys they do not declare**. `multi_branch_enabled` was never
 * added to the schema, so the flag the form carefully put in its payload is
 * discarded before any code has a chance to write it. Nothing throws and
 * nothing logs, which is why it reads as "not saving".
 *
 * This is the same failure shape as `branding-mobile-overrides-select-gap`: a
 * column that exists in the database, exists in the form, and is dropped by a
 * projection in between.
 *
 * The schema is the boundary worth pinning. If the flag survives `parse`, the
 * payload builders can carry it; if it does not, nothing downstream can.
 */

// The schema's required fields, and nothing else — so a failure here is about
// the branch flag rather than about fixture drift.
const MINIMAL_TENANT = {
  name: 'Cafe Juancho',
  slug: 'cafejuancho',
  domain: null,
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123456789',
}

describe('tenantSchema — multi_branch_enabled', () => {
  it('keeps the flag when a superadmin turns branches on', () => {
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, multi_branch_enabled: true })
    expect(parsed.multi_branch_enabled).toBe(true)
  })

  it('keeps the flag when a superadmin turns branches off', () => {
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, multi_branch_enabled: false })
    expect(parsed.multi_branch_enabled).toBe(false)
  })

  it('defaults to off for a tenant that never asked for branches', () => {
    // Matches the migration default and every other feature flag: a tenant
    // that never opted in must not have its storefront changed.
    const parsed = tenantSchema.parse(MINIMAL_TENANT)
    expect(parsed.multi_branch_enabled).toBe(false)
  })

  it('does not silently drop the flag the superadmin form sends', () => {
    // The regression itself: the key must survive parsing, not vanish from the
    // parsed object.
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, multi_branch_enabled: true })
    expect(Object.keys(parsed)).toContain('multi_branch_enabled')
  })
})
