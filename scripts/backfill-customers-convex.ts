#!/usr/bin/env node
/**
 * Backfill customer profiles from the order history held in tenants' OWN Convex
 * deployments.
 *
 * `db:backfill-customers` only sees orders in the platform Supabase project.
 * Convex-backed tenants keep their orders (and their customers' phone numbers)
 * in a separate deployment, so those months of history never produced a single
 * customer row. This sweep reads each Convex deployment and rolls its orders
 * into the platform `customers` table via the same idempotent capture the live
 * checkout path now uses.
 *
 * DRY-RUN BY DEFAULT — prints what it would do and writes nothing. Pass
 * `--execute` to persist. Scope to one tenant with `--tenant <id>`.
 *
 *   npm run db:backfill-customers-convex
 *   npm run db:backfill-customers-convex -- --execute
 *   npm run db:backfill-customers-convex -- --tenant <id> --execute
 *
 * Idempotent: capture upserts a ledger row keyed by (tenant, backend, order id)
 * and recomputes each profile from the full ledger, so re-running (or running
 * while live checkout happens) never double-counts.
 *
 * Thin I/O glue by design — the mapping is unit-tested in
 * `@/lib/customers-backfill-external`, the capture in `@/lib/customer-external-orders`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createConvexServerClient } from '@/lib/convex/server'
import { createSupabaseCustomerStore } from '@/lib/customers-service'
import {
  captureExternalOrderCustomer,
  createSupabaseExternalOrderLedger,
} from '@/lib/customer-external-orders'
import {
  groupConvexItemsByOrder,
  mapConvexOrderToExternalInput,
  type ConvexOrderRow,
  type ConvexOrderItemRow,
} from '@/lib/customers-backfill-external'

/** Convex `getOrders` caps at its own limit; ask for well beyond any tenant's history. */
const ORDER_FETCH_LIMIT = 10000

interface ConvexTenantRow {
  id: string
  name: string | null
  convex_deployment_url: string
  convex_deploy_key: string
}

interface TenantReport {
  scanned: number
  identified: number
  skipped: number
  failed: number
}

function parseArgs(argv: string[]): { execute: boolean; tenant: string | null } {
  const tenantIdx = argv.indexOf('--tenant')
  return {
    execute: argv.includes('--execute'),
    tenant: tenantIdx >= 0 ? (argv[tenantIdx + 1] ?? null) : null,
  }
}

function requireEnv(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      '❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).'
    )
    process.exit(1)
  }
  return { url, serviceKey }
}

async function fetchConvexTenants(
  admin: SupabaseClient,
  onlyTenant: string | null
): Promise<ConvexTenantRow[]> {
  let query = admin
    .from('tenants')
    .select('id, name, convex_deployment_url, convex_deploy_key')
    .not('convex_deployment_url', 'is', null)
    .not('convex_deploy_key', 'is', null)
    .neq('convex_deployment_url', '')
    .neq('convex_deploy_key', '')
    .order('created_at', { ascending: true })

  if (onlyTenant) query = query.eq('id', onlyTenant)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ConvexTenantRow[]
}

/**
 * Sweep one tenant's Convex deployment. Per-order failures are counted and
 * logged rather than thrown, so one malformed order can never abort a whole
 * tenant's backfill (and the run stays safely re-runnable).
 */
async function backfillTenant(
  admin: SupabaseClient,
  tenant: ConvexTenantRow,
  execute: boolean
): Promise<TenantReport> {
  const convex = createConvexServerClient(tenant.convex_deployment_url, tenant.convex_deploy_key)

  const orders = await convex.query<ConvexOrderRow[]>('orders:getOrders', {
    limit: ORDER_FETCH_LIMIT,
  })
  const items = await convex.query<ConvexOrderItemRow[]>('orders:getAllOrderItems', {})
  const itemsByOrder = groupConvexItemsByOrder(items ?? [])

  const identityStore = createSupabaseCustomerStore(admin)
  const ledger = createSupabaseExternalOrderLedger(admin)

  const report: TenantReport = { scanned: 0, identified: 0, skipped: 0, failed: 0 }

  for (const order of orders ?? []) {
    report.scanned++
    const input = mapConvexOrderToExternalInput(order, itemsByOrder.get(order._id) ?? [])

    if (!execute) {
      // Dry run: resolve identity only, so the operator sees the real hit rate
      // before anything is written.
      const { resolveCustomerIdentity } = await import('@/lib/customer-identity')
      const identity = resolveCustomerIdentity(input)
      if (identity.identityKey) report.identified++
      else report.skipped++
      continue
    }

    try {
      const customerId = await captureExternalOrderCustomer(
        identityStore,
        ledger,
        tenant.id,
        input
      )
      if (customerId) report.identified++
      else report.skipped++
    } catch (error) {
      report.failed++
      console.error(
        `    ✗ order ${order._id}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return report
}

async function main(): Promise<void> {
  const { execute, tenant } = parseArgs(process.argv.slice(2))
  const { url, serviceKey } = requireEnv()

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(
    `\n🧾 Convex customer backfill — ${execute ? 'EXECUTE (writing)' : 'DRY RUN (no writes)'}` +
      `${tenant ? `, tenant ${tenant}` : ', all Convex tenants'}\n`
  )

  const tenants = await fetchConvexTenants(admin, tenant)
  if (tenants.length === 0) {
    console.log('⚠️  No Convex-backed tenants matched. Nothing to do.')
    return
  }

  const totals: TenantReport = { scanned: 0, identified: 0, skipped: 0, failed: 0 }

  for (const t of tenants) {
    const label = t.name ?? t.id
    try {
      const report = await backfillTenant(admin, t, execute)
      console.log(
        `  • ${label}: scanned ${report.scanned}, identified ${report.identified}, ` +
          `anonymous ${report.skipped}, failed ${report.failed}` +
          (execute ? '  [written]' : '  [dry-run]')
      )
      totals.scanned += report.scanned
      totals.identified += report.identified
      totals.skipped += report.skipped
      totals.failed += report.failed
    } catch (error) {
      // An unreachable deployment must not stop the remaining tenants.
      console.error(
        `  ✗ ${label}: ${error instanceof Error ? error.message : String(error)} (skipped)`
      )
    }
  }

  console.log(
    `\n✅ Done. ${tenants.length} tenant(s): scanned ${totals.scanned}, ` +
      `identified ${totals.identified}, anonymous ${totals.skipped}, failed ${totals.failed}.` +
      (execute ? '' : '\n   Re-run with --execute to persist.')
  )
}

main().catch((error: unknown) => {
  console.error('❌ Backfill failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
