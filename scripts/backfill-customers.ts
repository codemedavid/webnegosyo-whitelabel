#!/usr/bin/env node
/**
 * Backfill per-tenant customer profiles from existing order history.
 *
 * DRY-RUN BY DEFAULT — it prints what it *would* do and writes nothing. Pass
 * `--execute` to persist. Optionally scope to one tenant with `--tenant <id>`.
 *
 * Idempotent: safe to re-run and safe to run while live checkout is happening,
 * because the underlying upsert recomputes each profile from the full linked
 * order set (never increments). Runs through the service-role client (RLS bypass)
 * — `customers` is PII and this is an operator/back-office task.
 *
 *   npm run db:backfill-customers                          # dry run, all tenants
 *   npm run db:backfill-customers -- --execute             # persist, all tenants
 *   npm run db:backfill-customers -- --tenant <id>         # dry run, one tenant
 *   npm run db:backfill-customers -- --tenant <id> --execute
 *
 * This file is intentionally thin I/O glue: identity + idempotency live in the
 * shared, unit-tested `@/lib/customers-backfill` + `@/lib/customers-service`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseCustomerStore } from '@/lib/customers-service'
import { backfillCustomers, type BackfillOrderRow, type BackfillReport } from '@/lib/customers-backfill'

const PAGE_SIZE = 1000

interface TenantRow {
  id: string
  name: string | null
}

interface RawOrderRow {
  id: string
  customer_name: string | null
  customer_contact: string | null
  customer_data: Record<string, unknown> | null
}

function parseArgs(argv: string[]): { execute: boolean; tenant: string | null } {
  const execute = argv.includes('--execute')
  const tenantIdx = argv.indexOf('--tenant')
  const tenant = tenantIdx >= 0 ? (argv[tenantIdx + 1] ?? null) : null
  return { execute, tenant }
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

async function fetchTenants(admin: SupabaseClient, onlyTenant: string | null): Promise<TenantRow[]> {
  let query = admin.from('tenants').select('id, name').order('created_at', { ascending: true })
  if (onlyTenant) query = query.eq('id', onlyTenant)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TenantRow[]
}

/** Page through a tenant's orders so we never silently cap at 1000 rows. */
async function fetchOrderRows(admin: SupabaseClient, tenantId: string): Promise<BackfillOrderRow[]> {
  const rows: BackfillOrderRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('orders')
      .select('id, customer_name, customer_contact, customer_data')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as RawOrderRow[]
    for (const o of page) {
      rows.push({
        id: o.id,
        name: o.customer_name,
        contact: o.customer_contact,
        customerData: o.customer_data,
      })
    }
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

function printReport(tenant: TenantRow, report: BackfillReport): void {
  const label = tenant.name ? `${tenant.name} (${tenant.id})` : tenant.id
  console.log(
    `  • ${label}: scanned ${report.scanned}, identifiable ${report.identifiable}, ` +
      `skipped ${report.skipped}, customers ${report.customersTouched}` +
      (report.dryRun ? '  [dry-run]' : '  [written]')
  )
}

async function main(): Promise<void> {
  const { execute, tenant } = parseArgs(process.argv.slice(2))
  const { url, serviceKey } = requireEnv()

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const store = createSupabaseCustomerStore(admin)

  console.log(
    `\n🧾 Customer backfill — ${execute ? 'EXECUTE (writing)' : 'DRY RUN (no writes)'}` +
      `${tenant ? `, tenant ${tenant}` : ', all tenants'}\n`
  )

  const tenants = await fetchTenants(admin, tenant)
  if (tenants.length === 0) {
    console.log('⚠️  No tenants matched. Nothing to do.')
    return
  }

  const totals = { scanned: 0, identifiable: 0, skipped: 0, customersTouched: 0 }
  for (const t of tenants) {
    const orders = await fetchOrderRows(admin, t.id)
    const report = await backfillCustomers(store, t.id, orders, { execute })
    printReport(t, report)
    totals.scanned += report.scanned
    totals.identifiable += report.identifiable
    totals.skipped += report.skipped
    totals.customersTouched += report.customersTouched
  }

  console.log(
    `\n✅ Done. ${tenants.length} tenant(s): scanned ${totals.scanned}, ` +
      `identifiable ${totals.identifiable}, skipped ${totals.skipped}, ` +
      `customers ${totals.customersTouched}.` +
      (execute ? '' : '\n   Re-run with --execute to persist.')
  )
}

main().catch((error: unknown) => {
  console.error('❌ Backfill failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
