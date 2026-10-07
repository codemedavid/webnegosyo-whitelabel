import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { planItemArrangement, type ItemPosition } from '@/lib/menu-item-arrangement'

const UNSAVED_ERROR = 'Could not save the new order. Please try again.'

/**
 * Put one category's dishes in the given order — the order both the storefront
 * and the register show them in.
 *
 * The category is re-read rather than trusting the client's numbers, so a
 * stale page cannot leave two dishes sharing a position. Each write is scoped
 * to the tenant AND the category and must report the row it changed: an RLS
 * refusal comes back as zero rows with no error, which would otherwise read as
 * saved.
 */
export async function reorderMenuItems(
  tenantId: string,
  categoryId: string,
  itemIds: readonly string[],
): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, order')
    .eq('tenant_id', tenantId)
    .eq('category_id', categoryId)

  if (error) throw error

  const plan = planItemArrangement((data ?? []) as unknown as ItemPosition[], itemIds)
  if (!plan.ok) throw new Error(plan.error)

  const results = await Promise.all(
    plan.writes.map(({ id, order }) =>
      supabase
        .from('menu_items')
        .update({ order })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('category_id', categoryId)
        .select('id'),
    ),
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
  if (results.some((result) => (result.data ?? []).length === 0)) throw new Error(UNSAVED_ERROR)
}
