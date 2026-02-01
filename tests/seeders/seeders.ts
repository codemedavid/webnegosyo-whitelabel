/**
 * Database seeding utilities for tests
 */

import { MENU_ITEMS_FIXTURE, VARIATIONS_FIXTURE, ADDONS_FIXTURE, TENANT_FIXTURE } from '../fixtures/fixtures'

/**
 * Seed menu items for testing
 */
export function seedMenuItems() {
  return [
    { ...MENU_ITEMS_FIXTURE.menuItem1, id: 'seeded-1' },
    { ...MENU_ITEMS_FIXTURE.menuItem2, id: 'seeded-2' },
  ]
}

/**
 * Seed variations for testing
 */
export function seedVariations() {
  return {
    single: { ...VARIATIONS_FIXTURE.singleVariation, id: 'seeded-variation-1' },
    grouped: {
      'seeded-size-type': {
        ...VARIATIONS_FIXTURE.groupedVariations['size-type'],
        id: 'seeded-option-1',
      },
    },
  }
}

/**
 * Seed addons for testing
 */
export function seedAddons() {
  return [
    { ...ADDONS_FIXTURE.addon1, id: 'seeded-addon-1' },
    { ...ADDONS_FIXTURE.addon2, id: 'seeded-addon-2' },
  ]
}

/**
 * Seed tenant for testing
 */
export function seedTenant() {
  return {
    ...TENANT_FIXTURE.tenant1,
    id: 'seeded-tenant-1',
  }
}

/**
 * Seed all test data
 */
export function seedAll() {
  return {
    menuItems: seedMenuItems(),
    variations: seedVariations(),
    addons: seedAddons(),
    tenant: seedTenant(),
  }
}
