import { describe, it, expect, jest } from '@jest/globals'
import type { ZodObject, ZodRawShape } from 'zod'
import { listMerchantOps, executeMerchantOp, MERCHANT_EXCLUDED_OPS } from '@/lib/mcp/merchant-ops'
import { listOps } from '@/lib/mcp/provisioning-ops'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

/**
 * Merchant-side MCP — Phase 3: tenant-pinned ops registry.
 *
 * The merchant surface reuses the provisioning ops registry but:
 * - excludes superadmin-only ops (tenant creation, cross-tenant reads,
 *   integrations, SMS campaigns),
 * - never advertises `tenantId` in any tool input schema, and
 * - injects the token-bound tenant server-side on every execution, overriding
 *   anything a caller smuggles in. That injection IS the security boundary.
 */

const ctx = { client: {} as never } as ProvisioningCtx
const PINNED_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const SMUGGLED_TENANT = '99999999-8888-7777-6666-555555555555'

const SUPERADMIN_ONLY = [
  'create_tenant',
  'list_tenants',
  'get_tenant',
  'configure_integration',
  'create_sms_campaign',
  'list_sms_campaigns',
]

describe('listMerchantOps', () => {
  it('excludes every superadmin-only op', () => {
    const names = listMerchantOps().map((op) => op.name)
    for (const excluded of SUPERADMIN_ONLY) {
      expect(names).not.toContain(excluded)
    }
  })

  it('keeps the merchant-facing menu, bundle, upsell and analytics ops', () => {
    const names = listMerchantOps().map((op) => op.name)
    for (const expected of [
      'add_category',
      'add_menu_item',
      'update_menu_item',
      'list_menu_items',
      'list_categories',
      'create_bundle',
      'create_upsell_pair',
      'get_menu_performance',
      'classify_menu',
      'apply_menu_classification',
      'reorder_categories',
      'reorder_menu_items',
      'update_branding',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('never advertises tenantId in any merchant tool input schema', () => {
    for (const op of listMerchantOps()) {
      const shape = (op.input as unknown as ZodObject<ZodRawShape>).shape
      expect(Object.keys(shape)).not.toContain('tenantId')
    }
  })

  it('exports the exclusion list so the route and docs stay in sync', () => {
    for (const excluded of SUPERADMIN_ONLY) {
      expect(MERCHANT_EXCLUDED_OPS.has(excluded)).toBe(true)
    }
  })
})

describe('executeMerchantOp', () => {
  it('injects the pinned tenantId into the underlying op payload', async () => {
    const execute = jest.fn(async () => ({ ok: true }))

    await executeMerchantOp('list_menu_items', ctx, PINNED_TENANT, {}, { execute })

    expect(execute).toHaveBeenCalledWith('list_menu_items', ctx, { tenantId: PINNED_TENANT })
  })

  it('overrides a smuggled tenantId with the pinned one', async () => {
    const execute = jest.fn(async () => ({ ok: true }))

    await executeMerchantOp(
      'update_menu_item',
      ctx,
      PINNED_TENANT,
      { tenantId: SMUGGLED_TENANT, itemId: 'item_1', price: 99 },
      { execute },
    )

    expect(execute).toHaveBeenCalledWith('update_menu_item', ctx, {
      tenantId: PINNED_TENANT,
      itemId: 'item_1',
      price: 99,
    })
  })

  it('refuses a superadmin-only op even when called directly', async () => {
    const execute = jest.fn(async () => ({ ok: true }))

    await expect(
      executeMerchantOp('create_tenant', ctx, PINNED_TENANT, { name: 'Evil Twin' }, { execute }),
    ).rejects.toThrow(/not available/i)
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses an unknown op', async () => {
    const execute = jest.fn(async () => ({ ok: true }))

    await expect(
      executeMerchantOp('delete_everything', ctx, PINNED_TENANT, {}, { execute }),
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('exposes exactly the provisioning registry minus the exclusions', () => {
    const merchantNames = new Set(listMerchantOps().map((op) => op.name))
    for (const op of listOps()) {
      const shouldBeExposed = !MERCHANT_EXCLUDED_OPS.has(op.name)
      expect(merchantNames.has(op.name)).toBe(shouldBeExposed)
    }
  })
})
