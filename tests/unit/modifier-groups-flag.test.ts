/**
 * Multi-select option groups (min/max picks) are the platform standard: every
 * store has them, and a store only falls back to the legacy variations/add-ons
 * editor when someone deliberately switches them off.
 *
 * Twice a store silently lost them (a column default of false, then an edit
 * that wrote false), so "on" must survive a missing value on every path.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { isModifierGroupsEnabled } from '@/lib/modifier-groups-flag'
import { tenantSchema } from '@/lib/tenants-service'

const ROOT = join(__dirname, '..', '..')

const MINIMAL_TENANT = {
  name: 'Test Cafe',
  slug: 'test-cafe',
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123',
}

describe('isModifierGroupsEnabled', () => {
  it.each([
    ['missing', {}],
    ['null', { modifier_groups_enabled: null }],
    ['true', { modifier_groups_enabled: true }],
  ])('reads %s as on', (_label, tenant) => {
    expect(isModifierGroupsEnabled(tenant)).toBe(true)
  })

  it('reads an absent tenant as on', () => {
    expect(isModifierGroupsEnabled(undefined)).toBe(true)
  })

  it('is off only when explicitly switched off', () => {
    expect(isModifierGroupsEnabled({ modifier_groups_enabled: false })).toBe(false)
  })
})

describe('tenant update schema', () => {
  it('keeps modifier groups on when an edit omits the flag', () => {
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, id: '3e15377e-9a4d-4d61-a3ac-beecfc9ab95c' })

    expect(parsed.modifier_groups_enabled).toBe(true)
  })

  it('still lets a superadmin switch them off', () => {
    const parsed = tenantSchema.parse({ ...MINIMAL_TENANT, modifier_groups_enabled: false })

    expect(parsed.modifier_groups_enabled).toBe(false)
  })
})

describe('every reader goes through isModifierGroupsEnabled', () => {
  it.each([
    'src/app/[tenant]/admin/menu/new/page.tsx',
    'src/app/[tenant]/admin/menu/[id]/page.tsx',
    'src/app/[tenant]/menu/item/[itemId]/page.tsx',
    'src/components/customer/product-detail-sheet.tsx',
  ])('%s', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8')

    expect(source).toMatch(/isModifierGroupsEnabled\(/)
    expect(source).not.toMatch(/modifier_groups_enabled\s*\?\?\s*false/)
    expect(source).not.toMatch(/!!tenant\.modifier_groups_enabled/)
  })

  it('the superadmin form shows a missing value as on', () => {
    const source = readFileSync(join(ROOT, 'src/components/superadmin/tenant-form-wrapper.tsx'), 'utf8')

    expect(source).toMatch(/featureFlag\('modifier_groups_enabled', true\)/)
  })
})
