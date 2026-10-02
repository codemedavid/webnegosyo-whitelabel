import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoyaltyReward, LoyaltyRules } from './types'

type FreeItemReward = Extract<LoyaltyReward, { type: 'free_item' }>

interface CatalogRow {
  id: string
  name: string
  is_available: boolean
  presell_enabled: boolean | null
  image_url: string | null
}

function freeItemIds(rules: LoyaltyRules): string[] {
  const rewards = [rules.reward, ...(rules.milestones ?? []).map((milestone) => milestone.reward)]
  return [...new Set(rewards.filter((reward): reward is FreeItemReward => reward.type === 'free_item').map((reward) => reward.menuItemId))]
}

function canonical(reward: LoyaltyReward, rows: Map<string, CatalogRow>): LoyaltyReward {
  if (reward.type !== 'free_item') return reward
  const row = rows.get(reward.menuItemId)!
  const rest: FreeItemReward = { type: 'free_item', menuItemId: row.id, itemName: row.name }
  return {
    ...rest,
    ...(row.image_url && /^https:\/\//.test(row.image_url) ? { imageUrl: row.image_url } : {}),
    ...(reward.emoji ? { emoji: reward.emoji } : {}),
  }
}

/**
 * Catalog IDs, names and photos are authoritative even when orders use another
 * backend. Every free-item rung is checked; the result is a new rules object
 * carrying the catalog's names and photos — the input is never modified.
 */
export async function resolveProgramCatalog(
  client: SupabaseClient,
  tenantId: string,
  rules: LoyaltyRules,
): Promise<{ rules: LoyaltyRules } | { error: string }> {
  const ids = freeItemIds(rules)
  if (ids.length === 0) return { rules }

  const { data, error } = await client
    .from('menu_items')
    .select('id, name, is_available, presell_enabled, image_url')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) throw new Error('Catalog could not be loaded.')

  const rows = new Map(((data ?? []) as CatalogRow[]).map((row) => [row.id, row]))
  for (const id of ids) {
    const row = rows.get(id)
    if (!row || !row.is_available) return { error: 'Choose an available menu item from this store.' }
    if (row.presell_enabled) return { error: 'Choose a regular item for the free-item reward.' }
  }

  return {
    rules: {
      ...rules,
      reward: canonical(rules.reward, rows),
      ...(rules.milestones?.length
        ? { milestones: rules.milestones.map((milestone) => ({ at: milestone.at, reward: canonical(milestone.reward, rows) })) }
        : {}),
    },
  }
}
