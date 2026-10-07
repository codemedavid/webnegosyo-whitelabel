/**
 * A brand-new store starts with every self-contained feature switched on —
 * except QR-handoff ordering, which replaces the Messenger checkout and must be
 * opted into.
 *
 * The defaults apply ONLY when a store is created. `tenantSchema` also parses
 * every update, so its own defaults stay `false`: an edit that omits a flag
 * must never switch a live store's feature on.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  NEW_TENANT_FEATURE_DEFAULTS,
  withNewTenantFeatureDefaults,
} from '@/lib/new-tenant-feature-defaults'
import { tenantSchema } from '@/lib/tenants-service'

const ROOT = join(__dirname, '..', '..')

const MINIMAL_TENANT = {
  name: 'Test Cafe',
  slug: 'test-cafe',
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123',
}

const ON_BY_DEFAULT = [
  'mapbox_enabled',
  'enable_order_management',
  'menu_engineering_enabled',
  'checkout_upsell_enabled',
  'bundles_enabled',
  'pairing_rules_enabled',
  'modifier_groups_enabled',
  'inventory_enabled',
  'low_stock_alerts_enabled',
  'auto_86_enabled',
  'presell_enabled',
  'multi_branch_enabled',
  'flash_screen_feature_enabled',
  'email_notifications_enabled',
] as const

describe('new tenant feature defaults', () => {
  it.each(ON_BY_DEFAULT)('turns %s on for a new store', (flag) => {
    const parsed = tenantSchema.parse(withNewTenantFeatureDefaults(MINIMAL_TENANT))

    expect(parsed[flag]).toBe(true)
  })

  it('leaves QR-handoff ordering off', () => {
    const parsed = tenantSchema.parse(withNewTenantFeatureDefaults(MINIMAL_TENANT))

    expect(parsed.qr_handoff_enabled).toBe(false)
  })

  it.each(['lalamove_enabled', 'loyverse_enabled', 'distance_delivery_enabled'] as const)(
    'leaves %s off — it cannot be on without per-store setup',
    (flag) => {
      // Each of these is refused by tenantSchema when on without credentials or
      // pricing, so defaulting it on would make every create fail.
      const result = tenantSchema.safeParse(withNewTenantFeatureDefaults(MINIMAL_TENANT))

      expect(result.success).toBe(true)
      expect(result.success && result.data[flag]).toBe(false)
    },
  )

  it('keeps a value the caller set explicitly', () => {
    const input = withNewTenantFeatureDefaults({
      ...MINIMAL_TENANT,
      inventory_enabled: false,
      qr_handoff_enabled: true,
    })

    expect(input.inventory_enabled).toBe(false)
    expect(input.qr_handoff_enabled).toBe(true)
  })

  it('does not mutate the input', () => {
    const input = { ...MINIMAL_TENANT }

    withNewTenantFeatureDefaults(input)

    expect(input).toEqual(MINIMAL_TENANT)
  })

  it('does not change the update-path schema defaults', () => {
    // tenantSchema parses edits too; its defaults must stay off.
    const parsed = tenantSchema.parse(MINIMAL_TENANT)

    expect(parsed.inventory_enabled).toBe(false)
    expect(parsed.multi_branch_enabled).toBe(false)
  })

  it('names every default as a boolean', () => {
    for (const value of Object.values(NEW_TENANT_FEATURE_DEFAULTS)) {
      expect(typeof value).toBe('boolean')
    }
  })
})

describe('create paths apply the new-store defaults', () => {
  it.each([
    ['src/lib/tenants-service.ts', /tenantSchema\.parse\(withNewTenantFeatureDefaults\(input\)\)/],
    ['src/actions/tenants.ts', /tenantSchema\.safeParse\(withNewTenantFeatureDefaults\(input\)\)/],
    ['src/components/superadmin/tenant-form-wrapper.tsx', /NEW_TENANT_FEATURE_DEFAULTS/],
  ])('%s', (file, pattern) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).toMatch(pattern)
  })
})
