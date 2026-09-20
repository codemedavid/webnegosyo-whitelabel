/**
 * Tenant-level image writes for provisioning callers (the MCP): hero, logo,
 * background, flash screen, and the two banner decks. Bytes or a link go
 * through `ingestImage` (ImageKit), and every column write goes through
 * `saveBrandingAction` so the tenant cache and storefront routes revalidate —
 * a direct `tenants` update would leave the live menu showing the old image.
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { saveBrandingAction } from '@/app/actions/branding'
import type { BrandingPatchInput, SaveBrandingResult } from '@/lib/branding-service'
import { hasImageSource, type ImageSource } from '@/lib/image-source'
import { resolveHeroPreset } from '@/lib/storefront-theme'
import {
  BANNER_COLUMN,
  appendBanner,
  newBannerId,
  normalizeBannerList,
  patchBanner,
  withoutBanner,
  type BannerFormat,
  type BannerSurface,
  type StoredBanner,
} from '@/lib/banner-list'

export type BrandingImageTarget = 'hero' | 'logo' | 'footer_logo' | 'background' | 'flash_screen'

export const BRANDING_IMAGE_COLUMN: Record<BrandingImageTarget, keyof BrandingPatchInput> = {
  hero: 'hero_image_url',
  logo: 'logo_url',
  footer_logo: 'footer_logo_url',
  background: 'background_image_url',
  flash_screen: 'flash_screen_image_url',
}

/** Presets whose media tile actually renders `hero_image_url`. */
const IMAGE_BEARING_HERO_PRESETS: ReadonlySet<string> = new Set(['split', 'collage', 'minimal', 'centered'])

export interface BrandingImageDeps {
  ingest: (source: ImageSource, folder: string) => Promise<{ url: string }>
  save: (tenantId: string, slug: string, patch: BrandingPatchInput, ctx: ProvisioningCtx) => Promise<SaveBrandingResult>
}

const defaultDeps: BrandingImageDeps = {
  // Lazy: keeps the server-only upload chain out of any client bundle.
  ingest: async (source, folder) => (await import('@/lib/image-ingest')).ingestImage(source, folder),
  save: saveBrandingAction,
}

type TenantRow = Record<string, unknown>

async function readTenantRow(ctx: ProvisioningCtx, tenantId: string, columns: string): Promise<TenantRow> {
  const { data, error } = await ctx.client.from('tenants').select(columns).eq('id', tenantId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Tenant not found')
  return data as unknown as TenantRow
}

/** The slug `saveBrandingAction` needs for revalidation, looked up from the id. */
export async function resolveTenantSlug(ctx: ProvisioningCtx, tenantId: string): Promise<string> {
  const row = await readTenantRow(ctx, tenantId, 'id, slug')
  return row.slug as string
}

async function commit(
  deps: BrandingImageDeps,
  ctx: ProvisioningCtx,
  tenantId: string,
  slug: string,
  patch: BrandingPatchInput,
): Promise<SaveBrandingResult> {
  const result = await deps.save(tenantId, slug, patch, ctx)
  if (!result.success) throw new Error(result.error ?? 'Branding save failed')
  return result
}

/**
 * Why a freshly-set hero image might still not show. `hero_image_url` is
 * only read on the preset path, and a featured product replaces the media
 * tile with a product card, so a caller that stops at "saved" would leave
 * the merchant staring at the same hero as before.
 */
export function heroImageWarning(row: { hero_preset?: unknown; hero_featured_product_id?: unknown }): string | null {
  if (typeof row.hero_featured_product_id === 'string' && row.hero_featured_product_id) {
    return 'hero_featured_product_id is set, and the featured product card replaces the hero image. Clear it with update_branding { hero_featured_product_id: "" } to show the image.'
  }
  const preset = resolveHeroPreset(row.hero_preset)
  if (!preset || !IMAGE_BEARING_HERO_PRESETS.has(preset)) {
    const current = typeof row.hero_preset === 'string' && row.hero_preset ? row.hero_preset : 'theme'
    return `hero_preset is "${current}", which does not render hero_image_url. Set update_branding { hero_preset: "split" } (or collage / minimal / centered) to show the image.`
  }
  return null
}

export interface SetTenantImageInput {
  tenantId: string
  target: BrandingImageTarget
  source: ImageSource
}

export interface SetTenantImageResult {
  target: BrandingImageTarget
  column: string
  url: string
  warning?: string
  skippedFields?: string[]
}

export async function setTenantImage(
  ctx: ProvisioningCtx,
  input: SetTenantImageInput,
  deps: BrandingImageDeps = defaultDeps,
): Promise<SetTenantImageResult> {
  const row = await readTenantRow(ctx, input.tenantId, 'id, slug, hero_preset, hero_featured_product_id')
  const column = BRANDING_IMAGE_COLUMN[input.target]
  const { url } = await deps.ingest(input.source, `branding/${input.tenantId}`)

  const saved = await commit(deps, ctx, input.tenantId, row.slug as string, { [column]: url } as BrandingPatchInput)

  const warnings = [saved.warning, input.target === 'hero' ? heroImageWarning(row) : null].filter(Boolean) as string[]
  return {
    target: input.target,
    column,
    url,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
    ...(saved.skippedFields?.length ? { skippedFields: saved.skippedFields } : {}),
  }
}

export interface AddTenantBannerInput {
  tenantId: string
  surface: BannerSurface
  source: ImageSource
  title?: string
  description?: string
  format?: BannerFormat
  /** Menu surface only: pass false to add the banner without switching the deck on. */
  visible?: boolean
}

export interface BannerWriteResult {
  surface: BannerSurface
  banner: StoredBanner | null
  banners: StoredBanner[]
  warning?: string
}

async function readBannerState(ctx: ProvisioningCtx, tenantId: string, surface: BannerSurface) {
  const column = BANNER_COLUMN[surface]
  const row = await readTenantRow(ctx, tenantId, `id, slug, is_promotion_visible, ${column}`)
  return { row, column, slug: row.slug as string, list: normalizeBannerList(row[column]) }
}

export async function addTenantBanner(
  ctx: ProvisioningCtx,
  input: AddTenantBannerInput,
  deps: BrandingImageDeps = defaultDeps,
): Promise<BannerWriteResult> {
  const { row, column, slug, list } = await readBannerState(ctx, input.tenantId, input.surface)
  const { url } = await deps.ingest(input.source, `branding/${input.tenantId}/banners`)

  const banner = appendBanner(list, input.surface, {
    imageUrl: url, title: input.title, description: input.description, format: input.format,
  }, newBannerId()).at(-1) as StoredBanner
  const banners = [...list, banner]

  const patch: Record<string, unknown> = { [column]: banners }
  if (input.surface === 'menu' && input.visible !== false) patch.is_promotion_visible = true
  const saved = await commit(deps, ctx, input.tenantId, slug, patch as BrandingPatchInput)

  const warning = input.surface === 'menu' && input.visible === false && row.is_promotion_visible !== true
    ? 'is_promotion_visible is OFF, so this banner is saved but hidden until update_branding { is_promotion_visible: true }.'
    : saved.warning
  return { surface: input.surface, banner, banners, ...(warning ? { warning } : {}) }
}

export interface UpdateTenantBannerInput {
  tenantId: string
  surface: BannerSurface
  bannerId: string
  title?: string | null
  description?: string | null
  format?: BannerFormat
  /** Replace the image too (bytes or link). */
  source?: ImageSource
}

export async function updateTenantBanner(
  ctx: ProvisioningCtx,
  input: UpdateTenantBannerInput,
  deps: BrandingImageDeps = defaultDeps,
): Promise<BannerWriteResult> {
  const { column, slug, list } = await readBannerState(ctx, input.tenantId, input.surface)
  const hasSource = hasImageSource(input.source)
  const imageUrl = hasSource
    ? (await deps.ingest(input.source as ImageSource, `branding/${input.tenantId}/banners`)).url
    : undefined

  const banners = patchBanner(list, input.bannerId, {
    imageUrl, title: input.title, description: input.description, format: input.format,
  })
  const saved = await commit(deps, ctx, input.tenantId, slug, { [column]: banners } as BrandingPatchInput)
  const banner = banners.find((b) => b.id === input.bannerId) ?? null
  return { surface: input.surface, banner, banners, ...(saved.warning ? { warning: saved.warning } : {}) }
}

export async function clearTenantBanner(
  ctx: ProvisioningCtx,
  input: { tenantId: string; surface: BannerSurface; bannerId: string },
  deps: BrandingImageDeps = defaultDeps,
): Promise<BannerWriteResult> {
  const { column, slug, list } = await readBannerState(ctx, input.tenantId, input.surface)
  const banners = withoutBanner(list, input.bannerId)
  const saved = await commit(deps, ctx, input.tenantId, slug, { [column]: banners } as BrandingPatchInput)
  return { surface: input.surface, banner: null, banners, ...(saved.warning ? { warning: saved.warning } : {}) }
}

export interface TenantBannersSnapshot {
  menu: { visible: boolean; banners: StoredBanner[] }
  welcome: { banners: StoredBanner[] }
}

export async function listTenantBanners(ctx: ProvisioningCtx, tenantId: string): Promise<TenantBannersSnapshot> {
  const row = await readTenantRow(ctx, tenantId, 'id, is_promotion_visible, promotion_banners, welcome_page_banners')
  return {
    menu: { visible: row.is_promotion_visible === true, banners: normalizeBannerList(row.promotion_banners) },
    welcome: { banners: normalizeBannerList(row.welcome_page_banners) },
  }
}

/**
 * The tenant's current value for every update_branding field. Reads `*` and
 * picks, rather than selecting the field list, because rollout-dependent
 * columns may not exist yet on a given database (see ROLLOUT_DEPENDENT_FIELDS).
 */
export async function readBrandingSnapshot(
  ctx: ProvisioningCtx,
  tenantId: string,
  fieldIds: readonly string[],
): Promise<{ slug: string; values: Record<string, unknown> }> {
  const row = await readTenantRow(ctx, tenantId, '*')
  const values: Record<string, unknown> = {}
  for (const id of fieldIds) {
    if (id in row) values[id] = row[id]
  }
  return { slug: row.slug as string, values }
}
