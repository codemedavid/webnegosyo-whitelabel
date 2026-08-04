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
  updateMenuItemImage: jest.fn(),
  setMenuItemImageFromData: jest.fn(),
  setMenuItemImageFromUrl: jest.fn(),
  updateMenuItemFields: jest.fn(),
  listMenuItemsForProvisioning: jest.fn(),
  listCategoriesForProvisioning: jest.fn(),
}))
jest.mock('@/app/actions/branding', () => ({ __esModule: true, saveBrandingAction: jest.fn() }))
jest.mock('@/lib/payment-methods-service', () => ({ __esModule: true, createPaymentMethod: jest.fn() }))
jest.mock('@/lib/addon-library-service', () => ({ __esModule: true, createAddonLibraryEntry: jest.fn() }))
jest.mock('@/lib/menu-engineering-service', () => ({ __esModule: true, createUpsellPair: jest.fn() }))
jest.mock('@/lib/bundles-service', () => ({ __esModule: true, createBundle: jest.fn() }))
jest.mock('@/lib/queries/menu-performance', () => ({ __esModule: true, fetchMenuPerformanceForTenantId: jest.fn() }))

import type { ProvisioningCtx } from '@/lib/provisioning/context'
// The MCP SDK derives each tool's advertised JSON schema by first passing the
// op's Zod `input` through `normalizeObjectSchema`. It ONLY returns a schema for
// raw shapes and ZodObjects; a record/intersection/union normalizes to
// `undefined`, and the SDK then advertises an empty `{type:object,properties:{}}`
// — leaving the model unable to pass any fields (e.g. create_tenant name/slug).
// We import the real SDK helper so this test reflects exactly what clients see.
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'

// Under next/jest (SWC), top-level ES imports run before the in-place jest.mock
// registers, so a static `import` of the SUT would bind the real services.
// Retrieve the mock handles and require the SUT AFTER the mocks are registered.
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { createTenantSupabase, updateTenantSupabase } = jest.requireMock('@/lib/tenants-service') as any
const { createCategory, createMenuItem, updateMenuItemImage, setMenuItemImageFromData, setMenuItemImageFromUrl, updateMenuItemFields, listMenuItemsForProvisioning, listCategoriesForProvisioning } = jest.requireMock('@/lib/admin-service') as any
const { saveBrandingAction } = jest.requireMock('@/app/actions/branding') as any
const { createPaymentMethod } = jest.requireMock('@/lib/payment-methods-service') as any
const { fetchMenuPerformanceForTenantId } = jest.requireMock('@/lib/queries/menu-performance') as any
const { executeOp, listOps, PROVISIONING_OPS } = require('@/lib/mcp/provisioning-ops')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  createTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1', slug: 'acme' } as never)
  updateTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1' } as never)
  createCategory.mockReset().mockResolvedValue({ id: 'cat_1' } as never)
  createMenuItem.mockReset().mockResolvedValue({ id: 'item_1' } as never)
  updateMenuItemImage.mockReset().mockResolvedValue({ id: 'item_1', image_url: 'https://cdn.example.com/biscoff.png' } as never)
  setMenuItemImageFromData.mockReset().mockResolvedValue({ id: 'item_1', image_url: 'https://ik.imagekit.io/demo/menu-items/biscoff.png' } as never)
  setMenuItemImageFromUrl.mockReset().mockResolvedValue({ id: 'item_1', image_url: 'https://ik.imagekit.io/demo/menu-items/d1.png' } as never)
  updateMenuItemFields.mockReset().mockResolvedValue({ id: 'item_1', description: 'Updated description text' } as never)
  listMenuItemsForProvisioning.mockReset().mockResolvedValue([
    { id: 'item_1', name: 'Biscoff Frappe', image_url: null },
    { id: 'item_2', name: 'Strawberry Soda', image_url: null },
  ] as never)
  listCategoriesForProvisioning.mockReset().mockResolvedValue([
    { id: 'cat_1', name: 'Drinks', order: 0, is_active: true },
  ] as never)
  saveBrandingAction.mockReset().mockResolvedValue({ success: true } as never)
  createPaymentMethod.mockReset().mockResolvedValue({ id: 'pm_1' } as never)
  fetchMenuPerformanceForTenantId.mockReset().mockResolvedValue({
    dataSource: 'convex',
    windowDays: 30,
    totalUnits: 12,
    totalRevenue: 2400,
    items: [{ itemId: 'item_1', name: 'Sisig', units: 12, revenue: 2400, unitShare: 1, revenueShare: 1 }],
    coverage: { complete: true },
  } as never)
})

describe('provisioning ops registry', () => {
  it('exposes a stable, non-empty list of named ops with descriptions', () => {
    const ops = listOps() as Array<{ name: string; description: string }>
    expect(ops.length).toBeGreaterThan(0)
    const names = ops.map((o) => o.name)
    expect(names).toEqual(expect.arrayContaining([
      'create_tenant', 'add_category', 'add_menu_item', 'update_branding', 'configure_integration',
      'list_menu_items', 'update_menu_item_image', 'upload_menu_item_image', 'update_menu_item',
      'import_menu_item_image_from_url', 'list_categories',
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

describe('advertised MCP input schemas (client-visible)', () => {
  it('every op advertises an object schema the SDK can expose (never the empty fallback)', () => {
    // If normalizeObjectSchema returns undefined, the MCP SDK falls back to an
    // empty parameter schema and the model cannot pass ANY arguments — which is
    // why create_tenant "could not be accessed": it was called with {}.
    const offenders = (listOps() as Array<{ name: string; input: never }>)
      .filter((op) => normalizeObjectSchema(op.input) === undefined)
      .map((op) => op.name)
    expect(offenders).toEqual([])
  })

  it('create_tenant advertises its required fields so the model knows what to send', () => {
    const create = (PROVISIONING_OPS as Record<string, { input: never }>)['create_tenant']
    const normalized = normalizeObjectSchema(create.input) as { shape?: Record<string, unknown> } | undefined
    expect(normalized).toBeDefined()
    const keys = Object.keys(normalized?.shape ?? {})
    expect(keys).toEqual(expect.arrayContaining(['name', 'slug', 'primary_color', 'secondary_color']))
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

  it('list_menu_items routes to listMenuItemsForProvisioning with tenantId + ctx', async () => {
    const result = await executeOp('list_menu_items', ctx, { tenantId: TENANT })
    expect(listMenuItemsForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Biscoff Frappe' }),
    ]))
  })

  it('update_menu_item_image sets the image_url on an existing item with ctx', async () => {
    await executeOp('update_menu_item_image', ctx, {
      tenantId: TENANT,
      itemId: ITEM,
      imageUrl: 'https://cdn.example.com/biscoff.png',
    })
    expect(updateMenuItemImage).toHaveBeenCalledWith(
      ITEM,
      TENANT,
      'https://cdn.example.com/biscoff.png',
      ctx,
    )
  })

  it('update_menu_item_image rejects a non-URL image value', async () => {
    await expect(
      executeOp('update_menu_item_image', ctx, {
        tenantId: TENANT,
        itemId: ITEM,
        imageUrl: 'not-a-url',
      }),
    ).rejects.toThrow()
    expect(updateMenuItemImage).not.toHaveBeenCalled()
  })

  it('upload_menu_item_image uploads base64 bytes and sets the image on an existing item', async () => {
    await executeOp('upload_menu_item_image', ctx, {
      tenantId: TENANT,
      itemId: ITEM,
      imageBase64: 'data:image/png;base64,aGVsbG8=',
      fileName: 'biscoff.png',
    })
    expect(setMenuItemImageFromData).toHaveBeenCalledWith(
      ITEM,
      TENANT,
      'data:image/png;base64,aGVsbG8=',
      'biscoff.png',
      ctx,
    )
  })

  it('upload_menu_item_image rejects a payload missing the image data', async () => {
    await expect(
      executeOp('upload_menu_item_image', ctx, { tenantId: TENANT, itemId: ITEM }),
    ).rejects.toThrow()
    expect(setMenuItemImageFromData).not.toHaveBeenCalled()
  })

  it('import_menu_item_image_from_url re-hosts a remote link on ImageKit for an existing item', async () => {
    await executeOp('import_menu_item_image_from_url', ctx, {
      tenantId: TENANT,
      itemId: ITEM,
      sourceUrl: 'https://drive.google.com/file/d/1AbCdEf/view?usp=sharing',
      fileName: 'D1-sizzling-sisig.png',
    })
    expect(setMenuItemImageFromUrl).toHaveBeenCalledWith(
      ITEM,
      TENANT,
      'https://drive.google.com/file/d/1AbCdEf/view?usp=sharing',
      'D1-sizzling-sisig.png',
      ctx,
    )
  })

  it('import_menu_item_image_from_url works without a fileName hint', async () => {
    await executeOp('import_menu_item_image_from_url', ctx, {
      tenantId: TENANT,
      itemId: ITEM,
      sourceUrl: 'https://cdn.example.com/menu/d1.png',
    })
    expect(setMenuItemImageFromUrl).toHaveBeenCalledWith(
      ITEM,
      TENANT,
      'https://cdn.example.com/menu/d1.png',
      undefined,
      ctx,
    )
  })

  it('import_menu_item_image_from_url rejects a non-URL source', async () => {
    await expect(
      executeOp('import_menu_item_image_from_url', ctx, { tenantId: TENANT, itemId: ITEM, sourceUrl: 'nope' }),
    ).rejects.toThrow()
    expect(setMenuItemImageFromUrl).not.toHaveBeenCalled()
  })

  it('list_categories routes to listCategoriesForProvisioning so category_id can be resolved by name', async () => {
    const result = await executeOp('list_categories', ctx, { tenantId: TENANT })
    expect(listCategoriesForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Drinks' })]))
  })

  it('update_menu_item routes editable fields (minus tenantId/itemId) to updateMenuItemFields with ctx', async () => {
    await executeOp('update_menu_item', ctx, {
      tenantId: TENANT,
      itemId: ITEM,
      description: 'A rich, velvety Biscoff frappe topped with crumbles',
      price: 149,
    })
    expect(updateMenuItemFields).toHaveBeenCalledWith(
      ITEM,
      TENANT,
      expect.objectContaining({ description: 'A rich, velvety Biscoff frappe topped with crumbles', price: 149 }),
      ctx,
    )
    // tenantId/itemId must not leak into the field patch
    const patch = updateMenuItemFields.mock.calls[0][2]
    expect(patch).not.toHaveProperty('tenantId')
    expect(patch).not.toHaveProperty('itemId')
  })

  it('update_menu_item rejects a payload missing itemId', async () => {
    await expect(
      executeOp('update_menu_item', ctx, { tenantId: TENANT, description: 'whatever text here' }),
    ).rejects.toThrow()
    expect(updateMenuItemFields).not.toHaveBeenCalled()
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

describe('destructive-op guardrail (safe by contract)', () => {
  it('registers no op whose name implies deletion/removal', () => {
    const ops = listOps() as Array<{ name: string }>
    const offenders = ops
      .map((o) => o.name)
      .filter((name) => /(^|_)(delete|drop|remove|destroy|deprovision|truncate|purge|wipe|teardown|erase)(_|$)/i.test(name))
    expect(offenders).toEqual([])
  })

  it('refuses to dispatch a destructive op name before it can ever reach a service', async () => {
    for (const name of ['delete_tenant', 'drop_menu_item', 'deprovision_tenant']) {
      await expect(executeOp(name, ctx, { tenantId: TENANT })).rejects.toThrow(/destructive/i)
    }
    // The generic "unknown op" path must not be what stops these.
    expect(updateTenantSupabase).not.toHaveBeenCalled()
  })
})

describe('tenant-deactivation guardrail', () => {
  it('refuses to deactivate a tenant through configure_integration', async () => {
    await expect(
      executeOp('configure_integration', ctx, {
        tenantId: TENANT,
        name: 'Acme', slug: 'acme', primary_color: '#111', secondary_color: '#222', messenger_page_id: '1',
        is_active: false,
      }),
    ).rejects.toThrow(/deactivat/i)
    expect(updateTenantSupabase).not.toHaveBeenCalled()
  })

  it('still allows configure_integration when is_active is not being turned off', async () => {
    await executeOp('configure_integration', ctx, {
      tenantId: TENANT,
      name: 'Acme', slug: 'acme', primary_color: '#111', secondary_color: '#222', messenger_page_id: '1',
      lalamove_enabled: true,
    })
    expect(updateTenantSupabase).toHaveBeenCalledWith(TENANT, expect.objectContaining({ lalamove_enabled: true }), ctx)
  })
})

describe('get_menu_performance', () => {
  it('is registered so the model can see what actually sells before it advises', () => {
    expect(Object.keys(PROVISIONING_OPS)).toContain('get_menu_performance')
  })

  it('reads through the tenant-routing helper, honouring the requested window', async () => {
    const result = await executeOp('get_menu_performance', ctx, { tenantId: TENANT, days: 14 })

    expect(fetchMenuPerformanceForTenantId).toHaveBeenCalledWith(TENANT, ctx, 14)
    expect(result).toMatchObject({ dataSource: 'convex', totalUnits: 12 })
  })

  it('defaults to a 30-day window when none is given', async () => {
    await executeOp('get_menu_performance', ctx, { tenantId: TENANT })

    expect(fetchMenuPerformanceForTenantId).toHaveBeenCalledWith(TENANT, ctx, 30)
  })

  it('advertises tenantId and days so the model knows what it may ask for', () => {
    const opSchema = (PROVISIONING_OPS as Record<string, { input: never }>)['get_menu_performance']
    const normalized = normalizeObjectSchema(opSchema.input) as { shape?: Record<string, unknown> } | undefined
    expect(Object.keys(normalized?.shape ?? {})).toEqual(expect.arrayContaining(['tenantId', 'days']))
  })

  it('rejects a window outside the supported range instead of silently clamping it', async () => {
    await expect(executeOp('get_menu_performance', ctx, { tenantId: TENANT, days: 0 })).rejects.toThrow()
    await expect(executeOp('get_menu_performance', ctx, { tenantId: TENANT, days: 4000 })).rejects.toThrow()
  })
})
