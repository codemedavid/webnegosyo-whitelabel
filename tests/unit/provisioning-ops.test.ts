import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock every service the ops registry dispatches to, so we can assert each op
// calls the correct writer with the injected ctx and the validated input.
const createTenantSupabase = jest.fn(async () => ({ id: 'tenant_1', slug: 'acme' }))
const updateTenantSupabase = jest.fn(async () => ({ id: 'tenant_1' }))
jest.mock('@/lib/tenants-service', () => ({ createTenantSupabase, updateTenantSupabase }))

const createCategory = jest.fn(async () => ({ id: 'cat_1' }))
const createMenuItem = jest.fn(async () => ({ id: 'item_1' }))
jest.mock('@/lib/admin-service', () => ({ createCategory, createMenuItem }))

const saveBrandingAction = jest.fn(async () => ({ success: true }))
jest.mock('@/app/actions/branding', () => ({ saveBrandingAction }))

const createPaymentMethod = jest.fn(async () => ({ id: 'pm_1' }))
jest.mock('@/lib/payment-methods-service', () => ({ createPaymentMethod }))

import { executeOp, listOps, PROVISIONING_OPS } from '@/lib/mcp/provisioning-ops'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  ;[createTenantSupabase, updateTenantSupabase, createCategory, createMenuItem, saveBrandingAction, createPaymentMethod]
    .forEach((m) => m.mockClear())
})

describe('provisioning ops registry', () => {
  it('exposes a stable, non-empty list of named ops with descriptions', () => {
    const ops = listOps()
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
