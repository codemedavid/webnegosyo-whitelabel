#!/usr/bin/env node
/**
 * Report (and optionally clean up) menu items the old Loyverse sync duplicated.
 *
 * REPORT-ONLY BY DEFAULT — it prints what it would do and writes nothing.
 *
 *   npm run db:loyverse-dedupe                        # report, all Loyverse tenants
 *   npm run db:loyverse-dedupe -- --tenant <id>       # report, one tenant
 *   npm run db:loyverse-dedupe -- --execute           # delete only the SAFE ones
 *
 * WHY THIS IS CAUTIOUS
 * Thirteen tables hold a foreign key to menu_items(id). A duplicate that has
 * ever been ordered, bundled, paired, priced per branch or given a recipe is
 * NOT safe to delete — removing it would orphan or cascade real history. So
 * `--execute` deletes only duplicates with zero references everywhere, and
 * prints the rest for a human to merge by hand.
 *
 * Nomination logic lives in the unit-tested `@/lib/loyverse/dedupe-plan`;
 * this file is I/O glue and reference counting.
 */

import { createClient } from '@supabase/supabase-js'
import {
  planLoyverseDedupe,
  type DedupeCandidateRow,
  type DedupeGroupPlan,
} from '@/lib/loyverse/dedupe-plan'

/**
 * Every table with a foreign key to menu_items(id), as of migration
 * 20260828120000. A duplicate referenced by ANY of these is left alone.
 * Keep this list in step with new migrations that reference menu_items.
 */
const REFERENCING_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'order_items', column: 'menu_item_id' },
  { table: 'platform_order_items', column: 'menu_item_id' },
  { table: 'bundle_items', column: 'menu_item_id' },
  { table: 'bundle_slots', column: 'menu_item_id' },
  { table: 'bundle_slot_price_overrides', column: 'menu_item_id' },
  { table: 'upsell_pairs', column: 'source_item_id' },
  { table: 'upsell_pairs', column: 'target_item_id' },
  { table: 'pairing_rules', column: 'menu_item_id' },
  { table: 'outlet_menu_items', column: 'menu_item_id' },
  { table: 'inventory_recipes', column: 'menu_item_id' },
  { table: 'addon_library', column: 'source_menu_item_id' },
  { table: 'modifier_group_library', column: 'source_menu_item_id' },
  { table: 'messenger_sessions', column: 'menu_item_id' },
  { table: 'loyverse_item_map', column: 'menu_item_id' },
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

interface ReferenceReport {
  total: number
  /** table.column -> count, only where count > 0. */
  byTable: Record<string, number>
  /** Tables that could not be counted (missing in this project). */
  unknownTables: string[]
}

async function countReferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  menuItemId: string
): Promise<ReferenceReport> {
  const byTable: Record<string, number> = {}
  const unknownTables: string[] = []
  let total = 0

  for (const { table, column } of REFERENCING_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, menuItemId)

    if (error) {
      // A table this deployment does not have is not evidence of safety.
      unknownTables.push(`${table}.${column}`)
      continue
    }
    if ((count ?? 0) > 0) {
      byTable[`${table}.${column}`] = count as number
      total += count as number
    }
  }
  return { total, byTable, unknownTables }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const tenantFlagIndex = args.indexOf('--tenant')
  const onlyTenant = tenantFlagIndex >= 0 ? args[tenantFlagIndex + 1] : null

  const admin = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  )

  let tenantQuery = admin.from('tenants').select('id, name, slug').eq('loyverse_enabled', true)
  if (onlyTenant) tenantQuery = tenantQuery.eq('id', onlyTenant)
  const { data: tenants, error: tenantsError } = await tenantQuery
  if (tenantsError) {
    console.error(`Failed to read tenants: ${tenantsError.message}`)
    process.exit(1)
  }

  console.log(
    execute
      ? '=== Loyverse duplicate cleanup (EXECUTE — deletes unreferenced duplicates) ===\n'
      : '=== Loyverse duplicate report (READ-ONLY — nothing will be written) ===\n'
  )

  let totalGroups = 0
  let totalSafe = 0
  let totalUnsafe = 0
  let totalDeleted = 0

  for (const tenant of (tenants ?? []) as Array<{ id: string; name: string; slug: string }>) {
    const { data: rows, error } = await admin
      .from('menu_items')
      .select('id, tenant_id, name, category_id, loyverse_item_id, created_at')
      .eq('tenant_id', tenant.id)
    if (error) {
      console.log(`${tenant.name} (${tenant.slug}): failed to read menu items — ${error.message}\n`)
      continue
    }

    const plans: DedupeGroupPlan[] = planLoyverseDedupe(
      (rows ?? []) as unknown as DedupeCandidateRow[]
    )
    if (plans.length === 0) {
      console.log(`${tenant.name} (${tenant.slug}): no duplicates\n`)
      continue
    }

    console.log(`${tenant.name} (${tenant.slug}) — ${plans.length} duplicated dish(es):`)
    for (const plan of plans) {
      totalGroups++
      console.log(`  "${plan.name}"  keep ${plan.keeperId}`)

      for (const duplicateId of plan.duplicateIds) {
        const references = await countReferences(admin, duplicateId)
        const safe = references.total === 0 && references.unknownTables.length === 0

        if (!safe) {
          totalUnsafe++
          const detail =
            references.total > 0
              ? Object.entries(references.byTable)
                  .map(([key, count]) => `${key}=${count}`)
                  .join(', ')
              : `uncountable: ${references.unknownTables.join(', ')}`
          console.log(`    KEEP-BY-HAND ${duplicateId} — referenced (${detail})`)
          continue
        }

        totalSafe++
        if (!execute) {
          console.log(`    would delete ${duplicateId} — no references`)
          continue
        }

        const { error: deleteError } = await admin.from('menu_items').delete().eq('id', duplicateId)
        if (deleteError) {
          console.log(`    FAILED to delete ${duplicateId} — ${deleteError.message}`)
          continue
        }
        totalDeleted++
        console.log(`    deleted ${duplicateId}`)
      }
    }
    console.log('')
  }

  console.log('--- Summary ---')
  console.log(`Duplicated dishes:            ${totalGroups}`)
  console.log(`Duplicates safe to delete:    ${totalSafe}`)
  console.log(`Duplicates needing a human:   ${totalUnsafe}`)
  if (execute) console.log(`Deleted:                      ${totalDeleted}`)
  else if (totalSafe > 0) console.log('\nRe-run with --execute to delete the safe ones.')

  if (totalUnsafe > 0) {
    console.log(
      '\nReferenced duplicates were NOT touched. They carry real history (orders,\n' +
        'bundles, upsell pairs, per-branch prices). Merge or retire them in the admin\n' +
        'UI rather than deleting rows out from under those references.'
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
