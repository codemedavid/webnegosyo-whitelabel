/**
 * Merchant-side MCP — Phase 5: launch_product.
 *
 * One call takes a product live: create the menu item (badge included), re-host
 * its photo, optionally wire an upsell from an existing best-seller, and hand
 * back the live menu URL.
 *
 * Partial-failure honesty is the point of the orchestrator: once the item
 * exists, a failed photo import or upsell wire-up must NOT throw the whole
 * launch away — the item is live, and the result says exactly which extras
 * failed and why. Only the item creation itself is allowed to abort the call.
 */

import { launchProduct, type LaunchProductDeps } from '@/lib/mcp/launch-product'
import { listOps } from '@/lib/mcp/provisioning-ops'
import { listMerchantOps } from '@/lib/mcp/merchant-ops'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { ZodObject, ZodRawShape } from 'zod'

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const NEW_ITEM = { id: 'item-new', name: 'Truffle Sisig', price: 249 }

function makeDeps(overrides: Partial<LaunchProductDeps> = {}): LaunchProductDeps {
  return {
    createItem: jest.fn(async (..._args: unknown[]) => NEW_ITEM),
    importImage: jest.fn(async (..._args: unknown[]) => ({ image_url: 'https://ik.example/x.jpg' })),
    createPair: jest.fn(async (..._args: unknown[]) => ({ id: 'pair-1' })),
    getStorefront: jest.fn(async (..._args: unknown[]) => ({ slug: 'gungjeon', domain: null })),
    ...overrides,
  }
}

describe('launchProduct', () => {
  const baseInput = { tenantId: TENANT, name: 'Truffle Sisig', price: 249, categoryId: 'cat-1' }

  it('creates the item (with badge) and returns the live menu URL', async () => {
    const deps = makeDeps()

    const result = await launchProduct(ctx, { ...baseInput, badgeText: 'NEW' }, deps)

    expect(deps.createItem).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ name: 'Truffle Sisig', price: 249, category_id: 'cat-1', badge_text: 'NEW' }),
      ctx,
    )
    expect(result.item).toEqual(NEW_ITEM)
    expect(result.menuUrl).toMatch(/^https:\/\/gungjeon\..+\/menu$/)
  })

  it('prefers the tenant custom domain for the menu URL', async () => {
    const deps = makeDeps({
      getStorefront: jest.fn(async (..._args: unknown[]) => ({ slug: 'gungjeon', domain: 'order.gungjeon.ph' })),
    })

    const result = await launchProduct(ctx, baseInput, deps)

    expect(result.menuUrl).toBe('https://order.gungjeon.ph/menu')
  })

  it('imports the photo for the freshly created item when imageUrl is given', async () => {
    const deps = makeDeps()

    const result = await launchProduct(
      ctx,
      { ...baseInput, imageUrl: 'https://drive.google.com/file/d/abc/view' },
      deps,
    )

    expect(deps.importImage).toHaveBeenCalledWith(
      'item-new',
      TENANT,
      'https://drive.google.com/file/d/abc/view',
      undefined,
      ctx,
    )
    expect(result.image.status).toBe('set')
  })

  it('keeps the launched item when the photo import fails, reporting the failure', async () => {
    const deps = makeDeps({
      importImage: jest.fn(async (..._args: unknown[]) => { throw new Error('not an image') }),
    })

    const result = await launchProduct(ctx, { ...baseInput, imageUrl: 'https://x.test/a.jpg' }, deps)

    expect(result.item).toEqual(NEW_ITEM)
    expect(result.image.status).toBe('failed')
    expect(result.image.note).toMatch(/not an image/)
  })

  it('wires a complementary upsell FROM the existing item TO the new product', async () => {
    const deps = makeDeps()

    const result = await launchProduct(ctx, { ...baseInput, suggestWithItemId: 'item-best' }, deps)

    expect(deps.createPair).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        source_item_id: 'item-best',
        target_item_id: 'item-new',
        pair_type: 'complementary',
      }),
      ctx,
    )
    expect(result.upsell.status).toBe('created')
  })

  it('keeps the launched item when the upsell wiring fails, reporting the failure', async () => {
    const deps = makeDeps({
      createPair: jest.fn(async (..._args: unknown[]) => { throw new Error('pair exists') }),
    })

    const result = await launchProduct(ctx, { ...baseInput, suggestWithItemId: 'item-best' }, deps)

    expect(result.item).toEqual(NEW_ITEM)
    expect(result.upsell.status).toBe('failed')
    expect(result.upsell.note).toMatch(/pair exists/)
  })

  it('marks the extras as skipped when they were not requested', async () => {
    const deps = makeDeps()

    const result = await launchProduct(ctx, baseInput, deps)

    expect(deps.importImage).not.toHaveBeenCalled()
    expect(deps.createPair).not.toHaveBeenCalled()
    expect(result.image.status).toBe('skipped')
    expect(result.upsell.status).toBe('skipped')
  })

  it('aborts the whole launch when the item itself cannot be created', async () => {
    const deps = makeDeps({
      createItem: jest.fn(async (..._args: unknown[]) => { throw new Error('duplicate name') }),
    })

    await expect(
      launchProduct(ctx, { ...baseInput, imageUrl: 'https://x.test/a.jpg' }, deps),
    ).rejects.toThrow(/duplicate name/)
    expect(deps.importImage).not.toHaveBeenCalled()
  })
})

describe('launch_product op registration', () => {
  it('is registered on the superadmin surface with a tenantId envelope', () => {
    const op = listOps().find((o) => o.name === 'launch_product')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining(['tenantId', 'name', 'price', 'categoryId']),
    )
  })

  it('is exposed to merchants without a tenantId field', () => {
    const op = listMerchantOps().find((o) => o.name === 'launch_product')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).not.toContain('tenantId')
  })
})
