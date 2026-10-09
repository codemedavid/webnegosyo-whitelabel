/**
 * A brand-new store's first Boost Sales offers.
 *
 * A new store has no orders, so the ideas come from the menu alone (cold
 * start: a main wants a side and a drink). The merchant's best sellers are
 * marked featured so combos and upgrades anchor on them.
 *
 * Upgrades, pairings and the cart's last call go live at once through
 * `applyBoostIdea` — the exact path an approved AI proposal takes — on the
 * injected service-role client. COMBOS DO NOT: they change what the menu
 * sells and at what price, so they are filed as pending suggestions
 * (`fileForApproval`) and wait for the owner's OK.
 *
 * Re-running is safe: offers already live are passed as `existing`, so the
 * same idea is never built twice, and the launch filing is one per store.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { buildBoostIdeas, type BoostIdea, type ExistingOffers } from '@/lib/boost/ideas'
import { classifyMenuRole } from '@/lib/boost/menu-roles'
import { applyBoostIdea } from '@/lib/boost/ai/apply'
import { fileLaunchProposals } from '@/lib/boost/ai/store'
import type { BoostItem, BoostLastCall } from '@/lib/boost/workspace'

export interface LaunchIdeaLimits {
  combos?: number
  upgrades?: number
  pairings?: number
  lastCall?: boolean
}

export interface LaunchBoostResult {
  applied: Array<{ kind: BoostIdea['kind']; ideaId: string; title: string; ref: string | null }>
  /** Filed for the owner's OK (combos), not live yet. */
  awaitingApproval: Array<{ kind: BoostIdea['kind']; ideaId: string; title: string }>
  skipped: Array<{ ideaId: string; reason: string }>
}

export interface LaunchBoostOptions {
  bestSellerIds?: readonly string[]
  limits?: LaunchIdeaLimits
  /** Where combos wait for approval; defaults to the store's launch suggestions. */
  fileForApproval?: (ideas: readonly BoostIdea[]) => Promise<void>
}

/** Offers that change what the menu sells and its prices wait for the owner. */
function needsApproval(idea: BoostIdea): boolean {
  return idea.kind === 'combo'
}

const DEFAULT_LIMITS: Required<LaunchIdeaLimits> = { combos: 2, upgrades: 3, pairings: 3, lastCall: true }
/** Enough ideas to fill every limit after the ideas engine's own per-kind caps. */
const IDEA_POOL_SIZE = 12
const MAX_MENU_ROWS = 1000

/** Keep the first N of each kind, in the ideas engine's ranking order. */
export function selectLaunchIdeas(ideas: readonly BoostIdea[], limits: LaunchIdeaLimits = {}): BoostIdea[] {
  const { combos, upgrades, pairings, lastCall } = { ...DEFAULT_LIMITS, ...limits }
  const caps: Record<BoostIdea['kind'], number> = {
    combo: combos,
    upgrade: upgrades,
    pairing: pairings,
    last_call: lastCall ? 1 : 0,
  }
  const taken: Record<BoostIdea['kind'], number> = { combo: 0, upgrade: 0, pairing: 0, last_call: 0 }

  return ideas.filter((idea) => {
    if (taken[idea.kind] >= caps[idea.kind]) return false
    taken[idea.kind] += 1
    return true
  })
}

interface MenuRow {
  id: string
  name: string
  price: number | string | null
  image_url: string | null
  category_id: string | null
  is_available: boolean | null
  is_featured: boolean | null
  show_in_checkout_upsell: boolean | null
  category: { name: string } | null
}

interface TenantLastCallRow {
  checkout_upsell_enabled: boolean | null
  checkout_upsell_title: string | null
  checkout_upsell_subtitle: string | null
  checkout_upsell_max_items: number | null
}

interface LaunchMenu {
  rows: MenuRow[]
  items: BoostItem[]
  lastCall: BoostLastCall
  existing: ExistingOffers
}

function raise(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} could not be read: ${error.message}`)
}

async function loadLaunchMenu(ctx: ProvisioningCtx, tenantId: string): Promise<LaunchMenu> {
  const client = ctx.client
  const [menu, tenant, slots, pairs] = await Promise.all([
    client
      .from('menu_items')
      .select('id, name, price, image_url, category_id, is_available, is_featured, show_in_checkout_upsell, category:categories(name)')
      .eq('tenant_id', tenantId)
      .order('order', { ascending: true })
      .limit(MAX_MENU_ROWS),
    client
      .from('tenants')
      .select('checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items')
      .eq('id', tenantId)
      .single(),
    client.from('bundles').select('slots:bundle_slots(included_item_ids)').eq('tenant_id', tenantId),
    client.from('upsell_pairs').select('source_item_id, pair_type').eq('tenant_id', tenantId),
  ])
  raise('Menu items', menu.error)
  raise('Store settings', tenant.error)
  raise('Combos', slots.error)
  raise('Offers', pairs.error)

  const rows = (menu.data ?? []) as unknown as MenuRow[]
  const settings = tenant.data as unknown as TenantLastCallRow
  const pairRows = (pairs.data ?? []) as Array<{ source_item_id: string; pair_type: string }>
  const bundleRows = (slots.data ?? []) as unknown as Array<{ slots: Array<{ included_item_ids: string[] | null }> | null }>

  const lastCall: BoostLastCall = {
    enabled: settings.checkout_upsell_enabled === true,
    title: settings.checkout_upsell_title?.trim() || 'Add to your order',
    subtitle: settings.checkout_upsell_subtitle?.trim() || '',
    maxItems: settings.checkout_upsell_max_items ?? 4,
    pickedItemIds: rows.filter((row) => row.show_in_checkout_upsell).map((row) => row.id),
  }

  return {
    rows,
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price ?? 0),
      imageUrl: row.image_url?.trim() || null,
      categoryId: row.category_id ?? null,
      categoryName: row.category?.name ?? null,
      isAvailable: row.is_available !== false,
      role: classifyMenuRole({ categoryName: row.category?.name, itemName: row.name }),
    })),
    lastCall,
    existing: {
      comboItemIds: new Set(bundleRows.flatMap((b) => (b.slots ?? []).flatMap((s) => s.included_item_ids ?? []))),
      upgradeSourceIds: new Set(pairRows.filter((p) => p.pair_type === 'upgrade').map((p) => p.source_item_id)),
      pairingSourceIds: new Set(pairRows.filter((p) => p.pair_type === 'complementary').map((p) => p.source_item_id)),
      lastCallEnabled: lastCall.enabled,
    },
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'The offer could not be saved.'
}

async function fileCombos(
  ideas: readonly BoostIdea[],
  file: (ideas: readonly BoostIdea[]) => Promise<void>,
  result: LaunchBoostResult
): Promise<LaunchBoostResult> {
  if (ideas.length === 0) return result
  try {
    await file(ideas)
    return { ...result, awaitingApproval: ideas.map((idea) => ({ kind: idea.kind, ideaId: idea.id, title: idea.title })) }
  } catch (error) {
    console.error('[onboarding/boost] combos not filed for approval:', describeError(error))
    return { ...result, skipped: [...result.skipped, ...ideas.map((idea) => ({ ideaId: idea.id, reason: describeError(error) }))] }
  }
}

export async function applyLaunchBoost(
  ctx: ProvisioningCtx,
  tenantId: string,
  opts: LaunchBoostOptions = {},
): Promise<LaunchBoostResult> {
  const menu = await loadLaunchMenu(ctx, tenantId)
  const bestSellers = new Set(opts.bestSellerIds ?? [])

  const ideas = buildBoostIdeas({
    items: menu.rows.map((row, index) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price ?? 0),
      categoryId: row.category_id ?? null,
      categoryName: row.category?.name ?? null,
      imageUrl: row.image_url,
      isAvailable: row.is_available !== false,
      isFeatured: row.is_featured === true || bestSellers.has(row.id),
      order: index,
    })),
    stats: null,
    existing: menu.existing,
    limit: IDEA_POOL_SIZE,
  })

  const selected = selectLaunchIdeas(ideas, opts.limits)
  const file = opts.fileForApproval
    ?? (async (combos: readonly BoostIdea[]) => { await fileLaunchProposals(ctx.client as unknown as SupabaseClient, tenantId, combos) })
  const result: LaunchBoostResult = { applied: [], awaitingApproval: [], skipped: [] }
  // One at a time: each offer is its own set of writes, and a failure on one
  // must not leave another half-written beside it.
  for (const idea of selected.filter((candidate) => !needsApproval(candidate))) {
    try {
      const outcome = await applyBoostIdea(tenantId, idea, { items: menu.items, lastCall: menu.lastCall }, ctx)
      if (outcome.status === 'needs-edit') {
        result.skipped.push({ ideaId: idea.id, reason: 'The offer needs editing before it can go live.' })
        continue
      }
      result.applied.push({ kind: idea.kind, ideaId: idea.id, title: idea.title, ref: outcome.ref })
    } catch (error) {
      console.error('[onboarding/boost] offer not applied:', idea.id, describeError(error))
      result.skipped.push({ ideaId: idea.id, reason: describeError(error) })
    }
  }
  return fileCombos(selected.filter(needsApproval), file, result)
}
