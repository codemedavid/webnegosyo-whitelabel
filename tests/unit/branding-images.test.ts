import { describe, it, expect, jest, beforeAll } from '@jest/globals'

jest.mock('@/app/actions/branding', () => ({ __esModule: true, saveBrandingAction: jest.fn() }))

import type * as BrandingImages from '@/lib/branding-images'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

// next/jest does not hoist jest.mock above static imports, so the module under
// test is loaded after the mock registers.
let mod: typeof BrandingImages
beforeAll(async () => {
  mod = await import('@/lib/branding-images')
})

const TENANT = '11111111-1111-4111-8111-111111111111'

function ctxWithRow(row: Record<string, unknown>) {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  })
  return { client: { from: () => builder } as never } as ProvisioningCtx
}

interface Deps { ingest: jest.Mock<(source: unknown, folder: string) => Promise<{ url: string }>>; save: jest.Mock<(...args: unknown[]) => Promise<{ success: boolean; error?: string }>> }

function deps(overrides: Partial<Deps> = {}): Deps {
  return {
    ingest: jest.fn(async () => ({ url: 'https://ik.imagekit.io/x/new.png' })),
    save: jest.fn(async () => ({ success: true })),
    ...overrides,
  }
}

const asDeps = (d: Deps) => d as unknown as BrandingImages.BrandingImageDeps

describe('heroImageWarning', () => {
  it('warns when a featured product would hide the image', () => {
    expect(mod.heroImageWarning({ hero_preset: 'split', hero_featured_product_id: 'p1' })).toMatch(/hero_featured_product_id/)
  })
  it('warns when the preset does not render media', () => {
    expect(mod.heroImageWarning({ hero_preset: 'theme' })).toMatch(/hero_preset is "theme"/)
    expect(mod.heroImageWarning({ hero_preset: 'banner' })).toMatch(/hero_preset is "banner"/)
    expect(mod.heroImageWarning({ hero_preset: 'custom' })).toMatch(/does not render/)
  })
  it('stays quiet on an image-bearing preset', () => {
    expect(mod.heroImageWarning({ hero_preset: 'split', hero_featured_product_id: '' })).toBeNull()
    expect(mod.heroImageWarning({ hero_preset: 'collage' })).toBeNull()
  })
})

describe('setTenantImage', () => {
  it('hosts the image under the tenant folder and writes the mapped column through the branding action', async () => {
    const d = deps()
    const ctx = ctxWithRow({ id: TENANT, slug: 'acme', hero_preset: 'split', hero_featured_product_id: null })

    const result = await mod.setTenantImage(ctx, { tenantId: TENANT, target: 'logo', source: { sourceUrl: 'https://a.com/logo.png' } }, asDeps(d))

    expect(d.ingest).toHaveBeenCalledWith({ sourceUrl: 'https://a.com/logo.png' }, `branding/${TENANT}`)
    expect(d.save).toHaveBeenCalledWith(TENANT, 'acme', { logo_url: 'https://ik.imagekit.io/x/new.png' }, ctx)
    expect(result).toEqual({ target: 'logo', column: 'logo_url', url: 'https://ik.imagekit.io/x/new.png' })
  })

  it('attaches the hero warning when the preset would hide the image', async () => {
    const d = deps()
    const result = await mod.setTenantImage(ctxWithRow({ id: TENANT, slug: 'acme', hero_preset: 'theme' }), { tenantId: TENANT, target: 'hero', source: { imageBase64: 'AAAA' } }, asDeps(d))
    expect(result.column).toBe('hero_image_url')
    expect(result.warning).toMatch(/hero_preset/)
  })

  it('never writes when the upload fails', async () => {
    const d = deps({ ingest: jest.fn(async () => { throw new Error('upload down') }) as Deps['ingest'] })
    await expect(mod.setTenantImage(ctxWithRow({ id: TENANT, slug: 'acme' }), { tenantId: TENANT, target: 'background', source: { imageBase64: 'x' } }, asDeps(d))).rejects.toThrow('upload down')
    expect(d.save).not.toHaveBeenCalled()
  })

  it('surfaces a refused save as an error', async () => {
    const d = deps({ save: jest.fn(async () => ({ success: false, error: 'nope' })) as Deps['save'] })
    await expect(mod.setTenantImage(ctxWithRow({ id: TENANT, slug: 'acme' }), { tenantId: TENANT, target: 'logo', source: { imageBase64: 'x' } }, asDeps(d))).rejects.toThrow('nope')
  })
})

describe('addTenantBanner', () => {
  it('appends to the existing menu deck and switches it on', async () => {
    const d = deps()
    const ctx = ctxWithRow({ id: TENANT, slug: 'acme', is_promotion_visible: false, promotion_banners: [{ id: 'old', imageUrl: 'https://x/old.png' }] })

    const result = await mod.addTenantBanner(ctx, { tenantId: TENANT, surface: 'menu', source: { imageBase64: 'AAAA', fileName: 'promo.png' }, title: 'Summer' }, asDeps(d))

    expect(d.ingest).toHaveBeenCalledWith({ imageBase64: 'AAAA', fileName: 'promo.png' }, `branding/${TENANT}/banners`)
    const patch = d.save.mock.calls[0][2] as { promotion_banners: Array<{ id: string }>; is_promotion_visible: boolean }
    expect(patch.is_promotion_visible).toBe(true)
    expect(patch.promotion_banners.map((b) => b.id)).toEqual(['old', result.banner?.id])
    expect(result.banner).toMatchObject({ imageUrl: 'https://ik.imagekit.io/x/new.png', title: 'Summer' })
    expect(result.banner?.format).toBeUndefined()
  })

  it('leaves the deck off when asked and says so', async () => {
    const d = deps()
    const result = await mod.addTenantBanner(ctxWithRow({ id: TENANT, slug: 'acme', is_promotion_visible: false, promotion_banners: [] }), { tenantId: TENANT, surface: 'menu', source: { imageBase64: 'A' }, visible: false }, asDeps(d))
    const patch = d.save.mock.calls[0][2] as Record<string, unknown>
    expect(patch).not.toHaveProperty('is_promotion_visible')
    expect(result.warning).toMatch(/is_promotion_visible/)
  })

  it('stamps a format on welcome banners and writes the welcome column', async () => {
    const d = deps()
    await mod.addTenantBanner(ctxWithRow({ id: TENANT, slug: 'acme', welcome_page_banners: '' }), { tenantId: TENANT, surface: 'welcome', source: { imageBase64: 'A' }, format: 'portrait' }, asDeps(d))
    const patch = d.save.mock.calls[0][2] as { welcome_page_banners: Array<{ format: string }> }
    expect(patch.welcome_page_banners[0].format).toBe('portrait')
    expect(patch).not.toHaveProperty('is_promotion_visible')
  })
})

describe('updateTenantBanner / clearTenantBanner / listTenantBanners', () => {
  const row = { id: TENANT, slug: 'acme', is_promotion_visible: true, promotion_banners: [{ id: 'a', imageUrl: 'https://x/a.png', title: 'A' }, { id: 'b', imageUrl: 'https://x/b.png' }], welcome_page_banners: [{ id: 'w', imageUrl: 'https://x/w.png', format: 'square' }] }

  it('edits copy without re-hosting when no image is given', async () => {
    const d = deps()
    const result = await mod.updateTenantBanner(ctxWithRow(row), { tenantId: TENANT, surface: 'menu', bannerId: 'a', title: null, description: 'new' }, asDeps(d))
    expect(d.ingest).not.toHaveBeenCalled()
    expect(result.banner).toEqual({ id: 'a', imageUrl: 'https://x/a.png', description: 'new' })
  })

  it('re-hosts and swaps the image when a source is given', async () => {
    const d = deps()
    const result = await mod.updateTenantBanner(ctxWithRow(row), { tenantId: TENANT, surface: 'menu', bannerId: 'b', source: { sourceUrl: 'https://a.com/n.png' } }, asDeps(d))
    expect(d.ingest).toHaveBeenCalled()
    expect(result.banner?.imageUrl).toBe('https://ik.imagekit.io/x/new.png')
  })

  it('clears one banner and keeps the rest', async () => {
    const d = deps()
    const result = await mod.clearTenantBanner(ctxWithRow(row), { tenantId: TENANT, surface: 'menu', bannerId: 'a' }, asDeps(d))
    expect(result.banners.map((b: { id: string }) => b.id)).toEqual(['b'])
  })

  it('refuses an unknown banner id without writing', async () => {
    const d = deps()
    await expect(mod.clearTenantBanner(ctxWithRow(row), { tenantId: TENANT, surface: 'welcome', bannerId: 'nope' }, asDeps(d))).rejects.toThrow(/list_banners/)
    expect(d.save).not.toHaveBeenCalled()
  })

  it('lists both decks with visibility', async () => {
    const result = await mod.listTenantBanners(ctxWithRow(row), TENANT)
    expect(result.menu.visible).toBe(true)
    expect(result.menu.banners).toHaveLength(2)
    expect(result.welcome.banners[0].format).toBe('square')
  })
})

describe('readBrandingSnapshot / resolveTenantSlug', () => {
  it('picks only the requested fields that exist on the row', async () => {
    const result = await mod.readBrandingSnapshot(ctxWithRow({ id: TENANT, slug: 'acme', hero_preset: 'split', secret: 'no' }), TENANT, ['hero_preset', 'card_template', 'secret_other'])
    expect(result).toEqual({ slug: 'acme', values: { hero_preset: 'split' } })
  })

  it('resolves the slug from the id', async () => {
    expect(await mod.resolveTenantSlug(ctxWithRow({ id: TENANT, slug: 'acme' }), TENANT)).toBe('acme')
  })
})
