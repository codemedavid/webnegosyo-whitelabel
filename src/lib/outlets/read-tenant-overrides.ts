/**
 * Every branch-menu difference a store has, read past the 1,000-row cap.
 *
 * The storefront reads ALL of a store's overrides in one go and picks the
 * branch in the browser (one cached page serves every branch). One response
 * from the platform database never carries more than 1,000 rows and says
 * nothing about the rest, and a difference that was not read is the claim
 * "this branch sells it at the store-wide price": past 1,000 rows a customer
 * would be quoted (and charged) another branch's price or offered a dish their
 * branch took off its board. So the read is paged, and a store above the
 * ceiling fails the read instead of answering with part of it.
 *
 * Browser-safe on purpose: the server catalog (anon client) and the browser
 * hook (`use-branch-overrides`) share it, so both read the same rows the same
 * way. `(outlet_id, menu_item_id)` is unique, which keeps a row from landing
 * on two pages or on none.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTLET_MENU_OVERRIDE_SELECT, type OutletMenuOverride } from '@/lib/outlets/outlet-menu-repository'
import { readAllRows, type PageQuery, type ReadAllRowsResult } from '@/platform/db/read-all-rows'

/** Same ceiling as the admin's branch menu reads (`supabase-outlet-menu-repository.ts`). */
export const MAX_TENANT_OVERRIDE_ROWS = 20_000

/** Any Supabase client: the server catalog's anon client or the browser's. */
export type OverrideQueryClient = Pick<SupabaseClient, 'from'>

export function readTenantOverrides(
  client: OverrideQueryClient,
  tenantId: string,
): Promise<ReadAllRowsResult<OutletMenuOverride>> {
  const query: PageQuery<OutletMenuOverride> = (from, to) =>
    client
      .from('outlet_menu_items')
      .select(OUTLET_MENU_OVERRIDE_SELECT)
      .eq('tenant_id', tenantId)
      .order('outlet_id', { ascending: true })
      .order('menu_item_id', { ascending: true })
      .range(from, to) as unknown as ReturnType<PageQuery<OutletMenuOverride>>
  return readAllRows(query, { maxRows: MAX_TENANT_OVERRIDE_ROWS })
}

/** One line for a log: why the read gave no usable list. */
export function overrideReadProblem(result: Exclude<ReadAllRowsResult<OutletMenuOverride>, { ok: true }>): string {
  return result.reason === 'error'
    ? result.error.message
    : `more than ${result.maxRows} branch menu differences, too many to load at once`
}
