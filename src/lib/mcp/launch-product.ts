/**
 * launch_product: the "take this product live in one call" orchestrator.
 *
 * Creates the menu item (badge included), re-hosts its photo, optionally wires
 * a complementary upsell from an existing item to the new one, and returns the
 * live menu URL.
 *
 * Partial-failure honesty: once the item exists it is LIVE — a failed photo
 * import or upsell wire-up reports itself in the result instead of throwing the
 * launch away (throwing would leave a live item the caller believes was rolled
 * back). Only the item creation itself aborts the call.
 *
 * Every service is injected via `deps` so the orchestration is unit-testable;
 * the defaults are the same services the standalone ops use.
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { createMenuItem, setMenuItemImageFromUrl } from '@/lib/admin-service'
import { createUpsellPair } from '@/lib/menu-engineering-service'

export interface LaunchProductInput {
  tenantId: string
  name: string
  price: number
  categoryId: string
  description?: string
  /** Overlay pill on the card (rendered when menu engineering is enabled). */
  badgeText?: string
  /** Source photo link (Drive/Dropbox share link or direct image URL). */
  imageUrl?: string
  imageFileName?: string
  /** Existing item that should suggest the new product ("Perfect with…"). */
  suggestWithItemId?: string
}

export interface LaunchStepResult {
  status: 'set' | 'created' | 'skipped' | 'failed'
  note?: string
}

export interface LaunchProductResult {
  item: unknown
  menuUrl: string
  image: LaunchStepResult
  upsell: LaunchStepResult & { pair?: unknown }
}

interface TenantStorefront {
  slug: string
  domain: string | null
}

export interface LaunchProductDeps {
  createItem?: (tenantId: string, payload: Record<string, unknown>, ctx: ProvisioningCtx) => Promise<unknown>
  importImage?: (
    itemId: string,
    tenantId: string,
    sourceUrl: string,
    fileName: string | undefined,
    ctx: ProvisioningCtx,
  ) => Promise<unknown>
  createPair?: (tenantId: string, payload: Record<string, unknown>, ctx: ProvisioningCtx) => Promise<unknown>
  getStorefront?: (tenantId: string, ctx: ProvisioningCtx) => Promise<TenantStorefront>
}

function errorNote(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

/** Same URL construction the Messenger menu card uses. */
function menuUrlOf(storefront: TenantStorefront): string {
  if (storefront.domain) {
    const base = storefront.domain.startsWith('http') ? storefront.domain : `https://${storefront.domain}`
    return `${base}/menu`
  }
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'webnegosyo.app'
  return `https://${storefront.slug}.${rootDomain}/menu`
}

async function defaultGetStorefront(tenantId: string, ctx: ProvisioningCtx): Promise<TenantStorefront> {
  const { data, error } = await ctx.client
    .from('tenants')
    .select('slug, domain')
    .eq('id', tenantId)
    .single()

  if (error || !data) {
    throw new Error(`Tenant ${tenantId} could not be loaded: ${error?.message ?? 'not found'}`)
  }
  return data as unknown as TenantStorefront
}

export async function launchProduct(
  ctx: ProvisioningCtx,
  input: LaunchProductInput,
  deps: LaunchProductDeps = {},
): Promise<LaunchProductResult> {
  const {
    createItem = (tenantId, payload, c) => createMenuItem(tenantId, payload as never, c),
    importImage = (itemId, tenantId, sourceUrl, fileName, c) =>
      setMenuItemImageFromUrl(itemId, tenantId, sourceUrl, fileName, c),
    createPair = (tenantId, payload, c) => createUpsellPair(tenantId, payload as never, c),
    getStorefront = defaultGetStorefront,
  } = deps

  // The item is the launch — if this fails, nothing happened and we throw.
  const item = await createItem(
    input.tenantId,
    {
      name: input.name,
      price: input.price,
      category_id: input.categoryId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.badgeText !== undefined ? { badge_text: input.badgeText } : {}),
    },
    ctx,
  )
  const itemId = (item as { id?: unknown })?.id
  if (typeof itemId !== 'string' || !itemId) {
    throw new Error('Item was created but no id came back, so the launch extras cannot be applied.')
  }

  let image: LaunchStepResult = { status: 'skipped' }
  if (input.imageUrl) {
    try {
      await importImage(itemId, input.tenantId, input.imageUrl, input.imageFileName, ctx)
      image = { status: 'set' }
    } catch (error) {
      image = { status: 'failed', note: `Photo import failed: ${errorNote(error)}. The item is live without a photo.` }
    }
  }

  let upsell: LaunchProductResult['upsell'] = { status: 'skipped' }
  if (input.suggestWithItemId) {
    try {
      const pair = await createPair(
        input.tenantId,
        {
          source_item_id: input.suggestWithItemId,
          target_item_id: itemId,
          pair_type: 'complementary',
        },
        ctx,
      )
      upsell = { status: 'created', pair }
    } catch (error) {
      upsell = { status: 'failed', note: `Upsell wiring failed: ${errorNote(error)}. The item is live without it.` }
    }
  }

  return { item, menuUrl: menuUrlOf(await getStorefront(input.tenantId, ctx)), image, upsell }
}
