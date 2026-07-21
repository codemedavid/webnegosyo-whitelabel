import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock every service the ops registry dispatches to. Factories reference only
// `jest` (hoist-safe: ES imports hoist above inline jest.mock, so a factory that
// closed over top-level consts would bind before those consts initialize).
// Each factory declares exactly the exports provisioning-ops imports.
jest.mock('@/lib/tenants-service', () => ({
  __esModule: true,
  createTenantSupabase: jest.fn(),
  updateTenantSupabase: jest.fn(),
  listTenantsSupabase: jest.fn(),
  getTenantBySlugSupabase: jest.fn(),
}))
jest.mock('@/lib/admin-service', () => ({
  __esModule: true,
  createCategory: jest.fn(),
  createMenuItem: jest.fn(),
}))
jest.mock('@/app/actions/branding', () => ({ __esModule: true, saveBrandingAction: jest.fn() }))
jest.mock('@/lib/payment-methods-service', () => ({ __esModule: true, createPaymentMethod: jest.fn() }))
jest.mock('@/lib/addon-library-service', () => ({ __esModule: true, createAddonLibraryEntry: jest.fn() }))
jest.mock('@/lib/menu-engineering-service', () => ({ __esModule: true, createUpsellPair: jest.fn() }))
jest.mock('@/lib/bundles-service', () => ({ __esModule: true, createBundle: jest.fn() }))

import type { ProvisioningCtx } from '@/lib/provisioning/context'

// Under next/jest (SWC), top-level ES imports run before the in-place jest.mock
// registers, so a static `import` of the SUT would bind the real services.
// Retrieve the mock handles and require the SUT AFTER the mocks are registered.
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { createTenantSupabase, updateTenantSupabase } = jest.requireMock('@/lib/tenants-service') as any
const { createCategory, createMenuItem } = jest.requireMock('@/lib/admin-service') as any
const { saveBrandingAction } = jest.requireMock('@/app/actions/branding') as any
const { createPaymentMethod } = jest.requireMock('@/lib/payment-methods-service') as any
const { executeOp, listOps, PROVISIONING_OPS } = require('@/lib/mcp/provisioning-ops')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  createTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1', slug: 'acme' } as never)
  updateTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1' } as never)
  createCategory.mockReset().mockResolvedValue({ id: 'cat_1' } as never)
  createMenuItem.mockReset().mockResolvedValue({ id: 'item_1' } as never)
  saveBrandingAction.mockReset().mockResolvedValue({ success: true } as never)
  createPaymentMethod.mockReset().mockResolvedValue({ id: 'pm_1' } as never)
})

describe('provisioning ops registry', () => {
  it('exposes a stable, non-empty list of named ops with descriptions', () => {
    const ops = listOps() as Array<{ name: string; description: string }>
    expect(ops.length).toBeGreaterThan(0)
    const names = ops.map((o) => o.name)
    expect(names).toEqual(expect.arrayContaining([
      'create_tenant', 'add_category', 'add_menu_item', 'update_branding', 'configure_integration',
    ]))
    for (const op of ops) {
      expect(typeof op.description).toBe('string')
      expect(op.description.length).toBeGreaterThan(0)
    }
    // registry map and list agree
    expect(Object.keys(PROVISIONING_OPS).sort()).toEqual(names.sort())
  })

  it('throws on an unknown op name', async () => {
    await expect(executeOp('does_not_exist', ctx, {})).rejects.toThrow(/unknown op/i)
  })
})

describe('executeOp dispatch', () => {
  it('create_tenant forwards the input and ctx to createTenantSupabase', async () => {
    const input = { name: 'Acme', slug: 'acme', primary_color: '#111', secondary_color: '#222', messenger_page_id: '1' }
    const result = await executeOp('create_tenant', ctx, input)
    expect(createTenantSupabase).toHaveBeenCalledWith(expect.objectContaining({ slug: 'acme' }), ctx)
    expect(result).toMatchObject({ id: 'tenant_1' })
  })

  it('add_category splits tenantId from the category payload and passes ctx', async () => {
    await executeOp('add_category', ctx, { tenantId: TENANT, name: 'Drinks', order: 0 })
    expect(createCategory).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ name: 'Drinks' }),
      ctx,
    )
    // tenantId must not leak into the category payload
    expect(createCategory.mock.calls[0][1]).not.toHaveProperty('tenantId')
  })

  it('add_menu_item routes to createMenuItem with tenantId + ctx', async () => {
    await executeOp('add_menu_item', ctx, { tenantId: TENANT, name: 'Latte', price: 100, category_id: 'c1' })
    expect(createMenuItem).toHaveBeenCalledWith(TENANT, expect.objectContaining({ name: 'Latte' }), ctx)
  })

  it('update_branding forwards tenantId, tenantSlug, branding and ctx', async () => {
    await executeOp('update_branding', ctx, {
      tenantId: TENANT,
      tenantSlug: 'acme',
      branding: { primary_color: '#111', secondary_color: '#222' },
    })
    expect(saveBrandingAction).toHaveBeenCalledWith(
      TENANT,
      'acme',
      expect.objectContaining({ primary_color: '#111' }),
      ctx,
    )
  })

  it('configure_integration routes to updateTenantSupabase with tenantId + ctx', async () => {
    await executeOp('configure_integration', ctx, {
      tenantId: TENANT,
      name: 'Acme', slug: 'acme', primary_color: '#111', secondary_color: '#222', messenger_page_id: '1',
      lalamove_enabled: true,
    })
    expect(updateTenantSupabase).toHaveBeenCalledWith(TENANT, expect.objectContaining({ lalamove_enabled: true }), ctx)
  })

  it('rejects an op payload missing its required tenantId', async () => {
    await expect(executeOp('add_category', ctx, { name: 'Drinks' })).rejects.toThrow()
    expect(createCategory).not.toHaveBeenCalled()
  })
})
