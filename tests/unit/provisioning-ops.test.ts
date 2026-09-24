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
  updateCategoryFields: jest.fn(),
}))
jest.mock('@/lib/tenant-owner-provisioning', () => ({ __esModule: true, createTenantOwnerWithClient: jest.fn(), listTenantUsersWithClient: jest.fn() }))
jest.mock('@/lib/branding-images', () => ({
  __esModule: true,
  setTenantImage: jest.fn(),
  addTenantBanner: jest.fn(),
  updateTenantBanner: jest.fn(),
  clearTenantBanner: jest.fn(),
  listTenantBanners: jest.fn(),
  readBrandingSnapshot: jest.fn(),
}))
jest.mock('@/lib/branding-write', () => ({ __esModule: true, saveBrandingWithClient: jest.fn() }))
jest.mock('@/lib/payment-methods-service', () => ({ __esModule: true, createPaymentMethod: jest.fn() }))
jest.mock('@/lib/addon-library-service', () => ({ __esModule: true, createAddonLibraryEntry: jest.fn(), listAddonLibraryForProvisioning: jest.fn() }))
jest.mock('@/lib/addon-bulk-attach', () => ({ __esModule: true, attachAddonEntriesToItems: jest.fn() }))
jest.mock('@/lib/sms-campaigns-service', () => ({ __esModule: true, createSmsCampaign: jest.fn(), listSmsCampaignsForProvisioning: jest.fn() }))
jest.mock('@/lib/menu-engineering-service', () => ({ __esModule: true, createUpsellPair: jest.fn(), updateUpsellPair: jest.fn(), bulkUpdateBcgClassification: jest.fn(), listUpsellPairsForProvisioning: jest.fn() }))
jest.mock('@/lib/bundles-service', () => ({ __esModule: true, createBundle: jest.fn(), updateBundle: jest.fn(), updateBundleFields: jest.fn(), setBundleImage: jest.fn(), listBundlesForProvisioning: jest.fn() }))
jest.mock('@/lib/queries/menu-performance', () => ({ __esModule: true, fetchMenuPerformanceForTenantId: jest.fn() }))
jest.mock('@/lib/menu-arrangement', () => ({ __esModule: true, reorderCategoriesForProvisioning: jest.fn(), reorderMenuItemsForProvisioning: jest.fn() }))

import type { ProvisioningCtx } from '@/lib/provisioning/context'
// The MCP SDK derives each tool's advertised JSON schema by first passing the
// op's Zod `input` through `normalizeObjectSchema`. It ONLY returns a schema for
// raw shapes and ZodObjects; a record/intersection/union normalizes to
// `undefined`, and the SDK then advertises an empty `{type:object,properties:{}}`
// — leaving the model unable to pass any fields (e.g. create_tenant name/slug).
// We import the real SDK helper so this test reflects exactly what clients see.
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'

// Under next/jest (SWC), top-level ES imports run before the in-place jest.mock
// registers, so a static `import` of the SUT would bind the real services.
// Retrieve the mock handles and require the SUT AFTER the mocks are registered.
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { createTenantSupabase, updateTenantSupabase, listTenantsSupabase } = jest.requireMock('@/lib/tenants-service') as any
const { createCategory, createMenuItem, updateMenuItemImage, setMenuItemImageFromData, setMenuItemImageFromUrl, updateMenuItemFields, listMenuItemsForProvisioning, listCategoriesForProvisioning, updateCategoryFields } = jest.requireMock('@/lib/admin-service') as any
const { createTenantOwnerWithClient, listTenantUsersWithClient } = jest.requireMock('@/lib/tenant-owner-provisioning') as any
const { setTenantImage, addTenantBanner, updateTenantBanner, clearTenantBanner, listTenantBanners, readBrandingSnapshot } = jest.requireMock('@/lib/branding-images') as any
const { updateBundle, updateBundleFields, setBundleImage } = jest.requireMock('@/lib/bundles-service') as any
const { updateUpsellPair } = jest.requireMock('@/lib/menu-engineering-service') as any
const { saveBrandingWithClient } = jest.requireMock('@/lib/branding-write') as any
const { createPaymentMethod } = jest.requireMock('@/lib/payment-methods-service') as any
const { fetchMenuPerformanceForTenantId } = jest.requireMock('@/lib/queries/menu-performance') as any
const { bulkUpdateBcgClassification } = jest.requireMock('@/lib/menu-engineering-service') as any
const { reorderCategoriesForProvisioning, reorderMenuItemsForProvisioning } = jest.requireMock('@/lib/menu-arrangement') as any
const { attachAddonEntriesToItems } = jest.requireMock('@/lib/addon-bulk-attach') as any
const { createBundle, listBundlesForProvisioning } = jest.requireMock('@/lib/bundles-service') as any
const { createSmsCampaign, listSmsCampaignsForProvisioning } = jest.requireMock('@/lib/sms-campaigns-service') as any
const { createUpsellPair, listUpsellPairsForProvisioning } = jest.requireMock('@/lib/menu-engineering-service') as any
const { listAddonLibraryForProvisioning } = jest.requireMock('@/lib/addon-library-service') as any
const { executeOp, listOps, PROVISIONING_OPS } = require('@/lib/mcp/provisioning-ops')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  createTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1', slug: 'acme' } as never)
  updateTenantSupabase.mockReset().mockResolvedValue({ id: 'tenant_1' } as never)
  listTenantsSupabase.mockReset().mockResolvedValue({
    data: [{ id: 'tenant_1', name: 'Acme', slug: 'acme', domain: 'acme.example.com' }],
    error: null,
  } as never)
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
  saveBrandingWithClient.mockReset().mockResolvedValue({ success: true } as never)
  createPaymentMethod.mockReset().mockResolvedValue({ id: 'pm_1' } as never)
  fetchMenuPerformanceForTenantId.mockReset().mockResolvedValue({
    dataSource: 'convex',
    windowDays: 30,
    totalUnits: 12,
    totalRevenue: 2400,
    items: [{ itemId: 'item_1', name: 'Sisig', units: 12, revenue: 2400, unitShare: 1, revenueShare: 1 }],
    coverage: { complete: true },
  } as never)
  bulkUpdateBcgClassification.mockReset().mockResolvedValue([{ id: 'item_1', bcg_classification: 'star' }] as never)
  reorderCategoriesForProvisioning.mockReset().mockResolvedValue({ reordered: 2 } as never)
  reorderMenuItemsForProvisioning.mockReset().mockResolvedValue({ reordered: 2 } as never)
  attachAddonEntriesToItems.mockReset().mockResolvedValue({ itemsUpdated: 2, addonsAttached: 1 } as never)
  listAddonLibraryForProvisioning.mockReset().mockResolvedValue([{ id: 'e1', name: 'Extra Shot', price: 30 }] as never)
  createBundle.mockReset().mockResolvedValue({ id: 'bundle_1', name: 'Meal Deal' } as never)
  createUpsellPair.mockReset().mockResolvedValue({ id: 'pair_1' } as never)
  listBundlesForProvisioning.mockReset().mockResolvedValue([{ id: 'bundle_1', name: 'Meal Deal' }] as never)
  listUpsellPairsForProvisioning.mockReset().mockResolvedValue([{ id: 'pair_1', pair_type: 'complementary' }] as never)
  createSmsCampaign.mockReset().mockResolvedValue({ id: 'camp_1', status: 'draft', notice: 'Saved as a DRAFT' } as never)
  updateCategoryFields.mockReset().mockResolvedValue({ id: 'cat_1', icon: 'lucide:pizza' } as never)
  createTenantOwnerWithClient.mockReset().mockResolvedValue({ userId: 'u1', email: 'owner@acme.ph', password: 'Secret123456', passwordGenerated: true } as never)
  listTenantUsersWithClient.mockReset().mockResolvedValue([{ user_id: 'u1', is_owner: true }] as never)
  setTenantImage.mockReset().mockResolvedValue({ target: 'hero', url: 'https://ik.imagekit.io/x/hero.png' } as never)
  addTenantBanner.mockReset().mockResolvedValue({ surface: 'menu', banner: { id: 'banner-1' }, banners: [] } as never)
  updateTenantBanner.mockReset().mockResolvedValue({ surface: 'menu', banner: { id: 'banner-1' }, banners: [] } as never)
  clearTenantBanner.mockReset().mockResolvedValue({ surface: 'menu', banner: null, banners: [] } as never)
  listTenantBanners.mockReset().mockResolvedValue({ menu: { visible: true, banners: [] }, welcome: { banners: [] } } as never)
  readBrandingSnapshot.mockReset().mockResolvedValue({ slug: 'acme', values: { hero_preset: 'split' } } as never)
  updateBundle.mockReset().mockResolvedValue({ id: 'bundle_1', name: 'Meal Deal XL' } as never)
  updateBundleFields.mockReset().mockResolvedValue({ id: 'bundle_1', name: 'Meal Deal XL' } as never)
  setBundleImage.mockReset().mockResolvedValue({ id: 'bundle_1', image_url: 'https://ik.imagekit.io/x/b.png' } as never)
  updateUpsellPair.mockReset().mockResolvedValue({ id: 'pair_1', is_active: false } as never)
  listSmsCampaignsForProvisioning.mockReset().mockResolvedValue([{ id: 'camp_1', name: 'Win-back' }] as never)
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

  it('returns a compact read-only tenant directory', async () => {
    const result = await executeOp('list_tenants', ctx, {})
    expect(result).toEqual([{ id: 'tenant_1', name: 'Acme', slug: 'acme' }])
    expect((PROVISIONING_OPS as Record<string, { readOnly?: boolean }>).list_tenants.readOnly).toBe(true)
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

  it('update_branding advertises the supported partial branding fields', () => {
    const updateBranding = (PROVISIONING_OPS as Record<string, { input: never }>)['update_branding']
    const normalized = normalizeObjectSchema(updateBranding.input)
    expect(normalized).toBeDefined()

    const jsonSchema = toJsonSchemaCompat(normalized!) as {
      properties?: { branding?: { properties?: Record<string, unknown> } }
    }
    const brandingFields = Object.keys(jsonSchema.properties?.branding?.properties ?? {})

    expect(brandingFields).toEqual(expect.arrayContaining([
      'logo_url',
      'header_color',
      'hero_title',
      'footer_address',
      'footer_facebook_url',
    ]))
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

  it('update_branding accepts and forwards a single-field branding patch', async () => {
    await executeOp('update_branding', ctx, {
      tenantId: TENANT,
      tenantSlug: 'acme',
      branding: { header_color: '#8B1A1A' },
    })
    expect(saveBrandingWithClient).toHaveBeenCalledWith(ctx.client, TENANT, { header_color: '#8B1A1A' })
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

/** What classify_menu hands back, narrowed to what these tests assert on. */
interface ClassifyResult {
  canApply: boolean
  marginBasis: string
  items: Array<{ itemId: string; classification: string }>
}

describe('classify_menu (propose, never write)', () => {
  beforeEach(() => {
    // A priced menu, which the default fixture (name + image only) does not carry.
    listMenuItemsForProvisioning.mockResolvedValue([
      { id: 'item_1', name: 'Sisig', price: 300, category_id: 'cat_1' },
      { id: 'item_2', name: 'Toast', price: 60, category_id: 'cat_1' },
    ] as never)
  })

  it('is registered and writes nothing', async () => {
    expect(Object.keys(PROVISIONING_OPS)).toContain('classify_menu')

    await executeOp('classify_menu', ctx, { tenantId: TENANT })

    expect(bulkUpdateBcgClassification).not.toHaveBeenCalled()
    expect(updateMenuItemFields).not.toHaveBeenCalled()
  })

  it('classifies the live menu against the tenant\'s real sales', async () => {
    fetchMenuPerformanceForTenantId.mockResolvedValue({
      dataSource: 'platform', windowDays: 30, totalUnits: 100, totalRevenue: 20000,
      items: [
        { itemId: 'item_1', name: 'Sisig', units: 90, revenue: 19000, unitShare: 0.9, revenueShare: 0.95 },
        { itemId: 'item_2', name: 'Toast', units: 10, revenue: 1000, unitShare: 0.1, revenueShare: 0.05 },
      ],
      coverage: { complete: true },
    } as never)

    const result = await executeOp('classify_menu', ctx, { tenantId: TENANT }) as ClassifyResult

    expect(result.canApply).toBe(true)
    expect(result.items.find((i) => i.itemId === 'item_1')?.classification).toBe('star')
    expect(result.marginBasis).toBe('price_proxy')
  })

  it('refuses to propose anything when the sales read was blind', async () => {
    fetchMenuPerformanceForTenantId.mockResolvedValue({
      dataSource: 'convex', windowDays: 30, totalUnits: 0, totalRevenue: 0, items: [],
      coverage: { complete: false, note: 'No order data in this window' },
    } as never)

    const result = await executeOp('classify_menu', ctx, { tenantId: TENANT }) as ClassifyResult

    expect(result.canApply).toBe(false)
    expect(result.items.every((i) => i.classification === 'unclassified')).toBe(true)
  })
})

describe('apply_menu_classification (write, only what was handed to it)', () => {
  it('writes exactly the classifications it was given', async () => {
    await executeOp('apply_menu_classification', ctx, {
      tenantId: TENANT,
      classifications: [
        { itemId: ITEM, classification: 'star' },
        { itemId: TENANT, classification: 'dog' },
      ],
    })

    expect(bulkUpdateBcgClassification).toHaveBeenCalledWith(
      TENANT,
      [
        { itemId: ITEM, classification: 'star' },
        { itemId: TENANT, classification: 'dog' },
      ],
      ctx,
    )
  })

  it('rejects a classification value the schema does not know', async () => {
    await expect(
      executeOp('apply_menu_classification', ctx, {
        tenantId: TENANT,
        classifications: [{ itemId: ITEM, classification: 'superstar' }],
      }),
    ).rejects.toThrow()
    expect(bulkUpdateBcgClassification).not.toHaveBeenCalled()
  })

  it('rejects an empty write instead of reporting a no-op as success', async () => {
    await expect(
      executeOp('apply_menu_classification', ctx, { tenantId: TENANT, classifications: [] }),
    ).rejects.toThrow()
  })
})

describe('menu arrangement ops', () => {
  const OTHER = '33333333-3333-4333-8333-333333333333'

  it('reorder_categories forwards the full ordering and ctx', async () => {
    const result = await executeOp('reorder_categories', ctx, {
      tenantId: TENANT,
      categoryIds: [ITEM, OTHER],
    })

    expect(reorderCategoriesForProvisioning).toHaveBeenCalledWith(TENANT, [ITEM, OTHER], ctx)
    expect(result).toMatchObject({ reordered: 2 })
  })

  it('reorder_menu_items scopes the ordering to one category', async () => {
    await executeOp('reorder_menu_items', ctx, {
      tenantId: TENANT,
      categoryId: OTHER,
      itemIds: [ITEM],
    })

    expect(reorderMenuItemsForProvisioning).toHaveBeenCalledWith(TENANT, OTHER, [ITEM], ctx)
  })

  it('rejects an empty ordering at the schema, before it reaches a writer', async () => {
    await expect(
      executeOp('reorder_categories', ctx, { tenantId: TENANT, categoryIds: [] }),
    ).rejects.toThrow()
    expect(reorderCategoriesForProvisioning).not.toHaveBeenCalled()
  })

  it('survives the destructive-name guardrail (reordering is not a deletion)', () => {
    expect(Object.keys(PROVISIONING_OPS)).toEqual(
      expect.arrayContaining(['reorder_categories', 'reorder_menu_items']),
    )
  })
})

describe('add-on ops', () => {
  const OTHER = '33333333-3333-4333-8333-333333333333'

  it('attach_addon_library_entries forwards items, entries and ctx', async () => {
    const result = await executeOp('attach_addon_library_entries', ctx, {
      tenantId: TENANT,
      itemIds: [ITEM, OTHER],
      entryIds: [ITEM],
    })

    expect(attachAddonEntriesToItems).toHaveBeenCalledWith(TENANT, [ITEM, OTHER], [ITEM], ctx)
    expect(result).toMatchObject({ itemsUpdated: 2 })
  })

  it('rejects an empty attach at the schema, before a writer sees it', async () => {
    await expect(
      executeOp('attach_addon_library_entries', ctx, { tenantId: TENANT, itemIds: [], entryIds: [ITEM] }),
    ).rejects.toThrow()
    expect(attachAddonEntriesToItems).not.toHaveBeenCalled()
  })

  it('list_addon_library reads the tenant library so entries resolve by name', async () => {
    const result = await executeOp('list_addon_library', ctx, { tenantId: TENANT }) as Array<Record<string, unknown>>

    expect(listAddonLibraryForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result[0]).toMatchObject({ name: 'Extra Shot' })
  })
})

/** A write result that may carry a feature-flag warning. */
interface WriteResult {
  id?: string
  warning?: string
}

describe('feature-flag warnings on promo writes', () => {
  /** ctx whose tenant read reports the given flags. */
  function ctxWithFlags(flags: Record<string, boolean>) {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      single: () => Promise.resolve({ data: flags, error: null }),
    })
    return { client: { from: () => builder } as never } as ProvisioningCtx
  }

  it('warns that a bundle written with bundles_enabled off will not be seen', async () => {
    const result = await executeOp('create_bundle', ctxWithFlags({ bundles_enabled: false }), {
      tenantId: TENANT, name: 'Meal Deal',
    }) as WriteResult

    expect(result.id).toBe('bundle_1')
    expect(result.warning).toMatch(/bundles_enabled/)
  })

  it('stays quiet when bundles are live', async () => {
    const result = await executeOp('create_bundle', ctxWithFlags({ bundles_enabled: true }), {
      tenantId: TENANT, name: 'Meal Deal',
    }) as WriteResult

    expect(result.warning).toBeUndefined()
  })

  it('warns that an upsell pair written with menu engineering off is inert', async () => {
    const result = await executeOp('create_upsell_pair', ctxWithFlags({ menu_engineering_enabled: false }), {
      tenantId: TENANT, source_item_id: ITEM, target_item_id: ITEM, pair_type: 'complementary',
    }) as WriteResult

    expect(result.warning).toMatch(/menu_engineering_enabled/)
  })
})

describe('promo reads', () => {
  it('list_bundles reads existing bundles so the model does not duplicate them', async () => {
    const result = await executeOp('list_bundles', ctx, { tenantId: TENANT }) as Array<Record<string, unknown>>

    expect(listBundlesForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result[0]).toMatchObject({ name: 'Meal Deal' })
  })

  it('list_upsell_pairs reads existing pairs', async () => {
    const result = await executeOp('list_upsell_pairs', ctx, { tenantId: TENANT }) as Array<Record<string, unknown>>

    expect(listUpsellPairsForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result[0]).toMatchObject({ pair_type: 'complementary' })
  })
})

describe('SMS campaign ops', () => {
  const DRAFT = {
    name: 'Bundle launch',
    message_template: 'Hi {{firstName}}, our new Meal Deal is live!',
    schedule_kind: 'one_off',
    schedule_date: '2026-09-01',
  }

  it('create_sms_campaign forwards the draft and ctx', async () => {
    const result = await executeOp('create_sms_campaign', ctx, { tenantId: TENANT, ...DRAFT }) as WriteResult

    expect(createSmsCampaign).toHaveBeenCalledWith(TENANT, expect.objectContaining({ name: 'Bundle launch' }), ctx)
    expect(result.id).toBe('camp_1')
  })

  it('does not leak tenantId into the campaign payload', async () => {
    await executeOp('create_sms_campaign', ctx, { tenantId: TENANT, ...DRAFT })

    expect(createSmsCampaign.mock.calls[0][1]).not.toHaveProperty('tenantId')
  })

  it('advertises the fields a campaign needs so the model knows what to send', () => {
    const opSchema = (PROVISIONING_OPS as Record<string, { input: never }>)['create_sms_campaign']
    const normalized = normalizeObjectSchema(opSchema.input) as { shape?: Record<string, unknown> } | undefined
    expect(Object.keys(normalized?.shape ?? {})).toEqual(
      expect.arrayContaining(['tenantId', 'name', 'message_template', 'schedule_kind']),
    )
  })

  it('list_sms_campaigns reads existing campaigns', async () => {
    const result = await executeOp('list_sms_campaigns', ctx, { tenantId: TENANT }) as Array<Record<string, unknown>>

    expect(listSmsCampaignsForProvisioning).toHaveBeenCalledWith(TENANT, ctx)
    expect(result[0]).toMatchObject({ name: 'Win-back' })
  })

  it('exposes no tool that could write consent, opt-out or a suppression', () => {
    // Consent must be a real boolean the customer produced at checkout. If a
    // provisioning tool could manufacture it, the opt-in record is decoration.
    const names = (listOps() as Array<{ name: string }>).map((o) => o.name)
    expect(names.filter((n) => /consent|opt_?out|suppress/i.test(n))).toEqual([])
  })
})

describe('owner account ops', () => {
  it('create_tenant_owner hands the service-role client and the envelope to the provisioner', async () => {
    const result = await executeOp('create_tenant_owner', ctx, { tenantId: TENANT, email: 'owner@acme.ph', displayName: 'Ana' }) as Record<string, unknown>

    expect(createTenantOwnerWithClient).toHaveBeenCalledWith(ctx.client, expect.objectContaining({ tenantId: TENANT, email: 'owner@acme.ph', displayName: 'Ana' }))
    expect(result.password).toBe('Secret123456')
  })

  it('rejects a malformed email and a short password at the schema', async () => {
    await expect(executeOp('create_tenant_owner', ctx, { tenantId: TENANT, email: 'nope' })).rejects.toThrow()
    await expect(executeOp('create_tenant_owner', ctx, { tenantId: TENANT, email: 'a@b.co', password: 'short' })).rejects.toThrow()
    expect(createTenantOwnerWithClient).not.toHaveBeenCalled()
  })

  it('list_tenant_users is a read-only tool', async () => {
    const op = (PROVISIONING_OPS as Record<string, { readOnly?: boolean }>)['list_tenant_users']
    expect(op.readOnly).toBe(true)
    await executeOp('list_tenant_users', ctx, { tenantId: TENANT })
    expect(listTenantUsersWithClient).toHaveBeenCalledWith(ctx.client, TENANT)
  })

  it('says the password is shown once, so the model relays it', () => {
    const op = (PROVISIONING_OPS as Record<string, { description: string }>)['create_tenant_owner']
    expect(op.description).toMatch(/once/i)
  })
})

describe('bundle & upsell edit ops', () => {
  const BUNDLE = '33333333-3333-4333-8333-333333333333'
  const PAIR = '44444444-4444-4444-8444-444444444444'

  it('update_bundle without slots patches only the row fields', async () => {
    const result = await executeOp('update_bundle', ctx, { tenantId: TENANT, bundleId: BUNDLE, name: 'Meal Deal XL', is_active: false }) as WriteResult

    expect(updateBundleFields).toHaveBeenCalledWith(BUNDLE, TENANT, { name: 'Meal Deal XL', is_active: false }, ctx)
    expect(updateBundle).not.toHaveBeenCalled()
    expect(result.id).toBe('bundle_1')
  })

  it('update_bundle with slots merges the current row and replaces the slot set', async () => {
    listBundlesForProvisioning.mockResolvedValue([
      { id: BUNDLE, name: 'Meal Deal', pricing_type: 'fixed', fixed_price: 199, image_url: 'https://ik/x.png', is_active: true, show_on_menu: true, show_as_upsell: false, display_order: 0 },
    ] as never)
    const slots = [{ name: 'Main', category_id: ITEM, pick_count: 1, sort_order: 0 }]

    await executeOp('update_bundle', ctx, { tenantId: TENANT, bundleId: BUNDLE, slots })

    expect(updateBundle).toHaveBeenCalledWith(BUNDLE, TENANT, expect.objectContaining({ name: 'Meal Deal', fixed_price: 199, image_url: 'https://ik/x.png', slots }), ctx)
    expect(updateBundle.mock.calls[0][2]).not.toHaveProperty('id')
  })

  it('update_bundle with slots refuses an unknown bundle before writing', async () => {
    listBundlesForProvisioning.mockResolvedValue([] as never)
    await expect(executeOp('update_bundle', ctx, { tenantId: TENANT, bundleId: BUNDLE, slots: [] })).rejects.toThrow(/not found/i)
    expect(updateBundle).not.toHaveBeenCalled()
  })

  it('set_bundle_image requires exactly one source', async () => {
    await expect(executeOp('set_bundle_image', ctx, { tenantId: TENANT, bundleId: BUNDLE })).rejects.toThrow(/exactly one/i)
    await expect(executeOp('set_bundle_image', ctx, { tenantId: TENANT, bundleId: BUNDLE, imageBase64: 'abc', sourceUrl: 'https://x.com/a.png' })).rejects.toThrow(/exactly one/i)
    expect(setBundleImage).not.toHaveBeenCalled()

    await executeOp('set_bundle_image', ctx, { tenantId: TENANT, bundleId: BUNDLE, sourceUrl: 'https://x.com/a.png', fileName: 'a.png' })
    expect(setBundleImage).toHaveBeenCalledWith(BUNDLE, TENANT, { sourceUrl: 'https://x.com/a.png', fileName: 'a.png' }, ctx)
  })

  it('update_upsell_pair forwards a partial patch without the envelope keys', async () => {
    await executeOp('update_upsell_pair', ctx, { tenantId: TENANT, pairId: PAIR, is_active: false, source_label: null })

    expect(updateUpsellPair).toHaveBeenCalledWith(PAIR, TENANT, { is_active: false, source_label: null }, ctx)
  })

  it('update_upsell_pair rejects an unknown display style at the schema', async () => {
    await expect(executeOp('update_upsell_pair', ctx, { tenantId: TENANT, pairId: PAIR, upgrade_display_style: 'popup' })).rejects.toThrow()
    expect(updateUpsellPair).not.toHaveBeenCalled()
  })
})

describe('branding image & banner ops', () => {
  it('update_branding never forwards a model-supplied slug (the writer reads it from the tenant row)', async () => {
    await executeOp('update_branding', ctx, { tenantId: TENANT, tenantSlug: '[tenant]', branding: { hero_preset: 'split' } })

    expect(saveBrandingWithClient).toHaveBeenCalledWith(ctx.client, TENANT, { hero_preset: 'split' })
  })

  it('set_branding_image forwards target and a single source', async () => {
    await executeOp('set_branding_image', ctx, { tenantId: TENANT, target: 'hero', imageBase64: 'data:image/png;base64,AAAA', fileName: 'hero.png' })

    expect(setTenantImage).toHaveBeenCalledWith(ctx, { tenantId: TENANT, target: 'hero', source: { imageBase64: 'data:image/png;base64,AAAA', fileName: 'hero.png' } })
  })

  it('set_branding_image refuses two sources and an unknown target', async () => {
    await expect(executeOp('set_branding_image', ctx, { tenantId: TENANT, target: 'hero', imageBase64: 'x', sourceUrl: 'https://a.com/b.png' })).rejects.toThrow(/exactly one/i)
    await expect(executeOp('set_branding_image', ctx, { tenantId: TENANT, target: 'favicon', sourceUrl: 'https://a.com/b.png' })).rejects.toThrow()
    expect(setTenantImage).not.toHaveBeenCalled()
  })

  it('add_banner forwards surface, source and copy', async () => {
    await executeOp('add_banner', ctx, { tenantId: TENANT, surface: 'welcome', sourceUrl: 'https://drive.google.com/file/d/abc/view', title: 'Summer', format: 'portrait' })

    expect(addTenantBanner).toHaveBeenCalledWith(ctx, {
      tenantId: TENANT, surface: 'welcome', source: { sourceUrl: 'https://drive.google.com/file/d/abc/view' },
      title: 'Summer', description: undefined, format: 'portrait', visible: undefined,
    })
  })

  it('add_banner needs an image', async () => {
    await expect(executeOp('add_banner', ctx, { tenantId: TENANT, surface: 'menu', title: 'No image' })).rejects.toThrow(/exactly one/i)
    expect(addTenantBanner).not.toHaveBeenCalled()
  })

  it('update_banner can edit copy without touching the image, or replace the image', async () => {
    await executeOp('update_banner', ctx, { tenantId: TENANT, surface: 'menu', bannerId: 'banner-1', title: null })
    expect(updateTenantBanner).toHaveBeenCalledWith(ctx, { tenantId: TENANT, surface: 'menu', bannerId: 'banner-1', title: null, description: undefined, format: undefined })

    await executeOp('update_banner', ctx, { tenantId: TENANT, surface: 'menu', bannerId: 'banner-1', sourceUrl: 'https://a.com/new.png' })
    expect(updateTenantBanner).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ bannerId: 'banner-1', source: { sourceUrl: 'https://a.com/new.png' } }))
  })

  it('clear_banner and list_banners dispatch; clear is not a destructive-named op', async () => {
    await executeOp('clear_banner', ctx, { tenantId: TENANT, surface: 'welcome', bannerId: 'banner-9' })
    expect(clearTenantBanner).toHaveBeenCalledWith(ctx, { tenantId: TENANT, surface: 'welcome', bannerId: 'banner-9' })

    await executeOp('list_banners', ctx, { tenantId: TENANT })
    expect(listTenantBanners).toHaveBeenCalledWith(ctx, TENANT)
  })

  it('get_branding returns current values AND the option vocabulary', async () => {
    const result = await executeOp('get_branding', ctx, { tenantId: TENANT }) as { values: Record<string, unknown>; options: Record<string, string[]>; tenantSlug: string }

    expect(readBrandingSnapshot).toHaveBeenCalledWith(ctx, TENANT, expect.arrayContaining(['hero_preset', 'card_template', 'promotion_banners']))
    expect(result.tenantSlug).toBe('acme')
    expect(result.values.hero_preset).toBe('split')
    expect(result.options.hero_preset).toEqual(expect.arrayContaining(['split', 'collage', 'custom']))
    expect(result.options.card_template).toEqual(expect.arrayContaining(['classic', 'minimal']))
  })
})

describe('category icon ops', () => {
  const CAT = '55555555-5555-4555-8555-555555555555'
  const CAT2 = '66666666-6666-4666-8666-666666666666'

  it('add_category advertises icon and icon_color so the model can see them', () => {
    const opSchema = (PROVISIONING_OPS as Record<string, { input: never }>)['add_category']
    const normalized = normalizeObjectSchema(opSchema.input) as { shape?: Record<string, unknown> } | undefined
    expect(Object.keys(normalized?.shape ?? {})).toEqual(expect.arrayContaining(['tenantId', 'name', 'icon', 'icon_color']))
  })

  it('add_category still lets unlisted category fields flow through to the writer', async () => {
    await executeOp('add_category', ctx, { tenantId: TENANT, name: 'Drinks', icon: 'lucide:coffee', default_addons: [] })
    expect(createCategory).toHaveBeenCalledWith(TENANT, expect.objectContaining({ name: 'Drinks', icon: 'lucide:coffee', default_addons: [] }), ctx)
  })

  it('list_category_icons returns the grouped catalog and the storage convention', async () => {
    const result = await executeOp('list_category_icons', ctx, {}) as { convention: string; groups: Array<{ label: string; icons: string[] }> }
    expect(result.convention).toBe('lucide:<name>')
    expect(result.groups.find((g) => g.label === 'Popular')?.icons).toContain('pizza')
  })

  it('update_category forwards a partial patch', async () => {
    await executeOp('update_category', ctx, { tenantId: TENANT, categoryId: CAT, icon: 'lucide:pizza', icon_color: '#E63946' })
    expect(updateCategoryFields).toHaveBeenCalledWith(CAT, TENANT, { icon: 'lucide:pizza', icon_color: '#E63946' }, ctx)
  })

  it('set_category_icons validates every name before writing any', async () => {
    await expect(executeOp('set_category_icons', ctx, {
      tenantId: TENANT,
      assignments: [{ categoryId: CAT, icon: 'lucide:pizza' }, { categoryId: CAT2, icon: 'lucide:not-a-thing' }],
    })).rejects.toThrow(/not-a-thing/)
    expect(updateCategoryFields).not.toHaveBeenCalled()
  })

  it('set_category_icons applies every valid assignment', async () => {
    const result = await executeOp('set_category_icons', ctx, {
      tenantId: TENANT,
      assignments: [{ categoryId: CAT, icon: 'lucide:pizza', icon_color: '#E63946' }, { categoryId: CAT2, icon: '🍜' }],
    }) as { updated: number }

    expect(result.updated).toBe(2)
    expect(updateCategoryFields).toHaveBeenNthCalledWith(1, CAT, TENANT, { icon: 'lucide:pizza', icon_color: '#E63946' }, ctx)
    expect(updateCategoryFields).toHaveBeenNthCalledWith(2, CAT2, TENANT, { icon: '🍜' }, ctx)
  })

  it('set_category_icons rejects a bad hex colour', async () => {
    await expect(executeOp('set_category_icons', ctx, { tenantId: TENANT, assignments: [{ categoryId: CAT, icon: 'lucide:pizza', icon_color: 'red' }] })).rejects.toThrow(/hex/i)
  })
})
