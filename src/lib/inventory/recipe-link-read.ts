/**
 * Reading which dishes are linked to inventory, for the admin menu list.
 *
 * Runs for an admin looking at their own menu, so it goes through the
 * RLS-enforcing server client like every other admin read. One query — the
 * components with their recipe joined — because the menu page already loads
 * everything else it shows and must not pay a coverage-sized read for a badge.
 *
 * The rule lives in `recipe-link.ts`; this only fetches what it needs.
 */

import { createClient } from '@/lib/supabase/server'
import { collectLinkedMenuItemIds, type RecipeLinkRow } from '@/lib/inventory/recipe-link'

export interface RecipeLinkResult {
  /**
   * Ids of dishes whose sales deduct stock, or `null` when the read failed.
   * The distinction matters: an empty list accuses every dish of being
   * unlinked, and a failure must never borrow that meaning.
   */
  linkedMenuItemIds: string[] | null
}

/** Which of this tenant's dishes have a working recipe. Never throws. */
export async function getLinkedMenuItemIds(tenantId: string): Promise<RecipeLinkResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('recipe_components')
      .select('recipes!inner(menu_item_id, target_type)')
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[inventory] Recipe link read failed', tenantId, error)
      return { linkedMenuItemIds: null }
    }

    return {
      linkedMenuItemIds: collectLinkedMenuItemIds((data ?? []) as unknown as RecipeLinkRow[]),
    }
  } catch (error) {
    console.error('[inventory] Failed to read recipe links', tenantId, error)
    return { linkedMenuItemIds: null }
  }
}
