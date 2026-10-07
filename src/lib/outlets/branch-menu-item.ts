import type { MenuItem } from '@/types/database'

/**
 * The menu fields the branch menu panel reads. Kept to exactly these so the
 * branch page sends a list of names and prices to the browser, not the full
 * menu rows with their variation and modifier JSON.
 */
export type BranchMenuItem = Pick<
  MenuItem,
  'id' | 'name' | 'category_id' | 'price' | 'discounted_price' | 'is_available'
>
