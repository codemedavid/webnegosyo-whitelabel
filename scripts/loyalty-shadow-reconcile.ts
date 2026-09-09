#!/usr/bin/env node
/**
 * Shadow reconciliation for loyalty earning.
 *
 * For every tenant with loyalty enabled (or one, with `--tenant <id>`), replays
 * the engine over the trailing window of order facts and compares what it
 * would earn against the shadow ledger rows actually recorded. READ-ONLY: it
 * prints discrepancies and writes nothing.
 *
 *   npm run loyalty:reconcile                    # every loyalty-enabled tenant, 30 days
 *   npm run loyalty:reconcile -- --tenant <id>   # one tenant
 *   npm run loyalty:reconcile -- --days 90
 *
 * A clean run (no missing, no unexpected) is the evidence a store needs before
 * `loyalty_shadow` is switched off. Rules live in `@/lib/loyalty/shadow`.
 */

import { createClient } from '@supabase/supabase-js'
import { fetchCustomerOrderFacts } from '@/lib/queries/customer-facts'
import { loadActiveLoyaltyPrograms } from '@/lib/loyalty/store'
import { reconcileShadowEarning, type ShadowLedgerRow } from '@/lib/loyalty/shadow'

const DEFAULT_DAYS = 30

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  const client = createClient(url, key)

  const days = Number(argValue('--days')) || DEFAULT_DAYS
  const onlyTenant = argValue('--tenant')

  let query = client
    .from('tenants')
    .select('id, name, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key, supabase_order_service_key')
    .eq('loyalty_enabled', true)
  if (onlyTenant) query = query.eq('id', onlyTenant)
  const { data: tenants, error } = await query
  if (error) throw error

  const now = new Date()
  let dirty = 0
  for (const tenant of tenants ?? []) {
    const programs = await loadActiveLoyaltyPrograms(client, tenant.id)
    const read = await fetchCustomerOrderFacts(tenant as never, { days, platformClient: client as never, now })

    // Ledger rows need the customer's phone to build a fact; the reader leaves
    // it null for ledger-backed tenants, so fill it from the profile.
    const customerIds = [...new Set(read.facts.map((f) => f.customerId).filter((id): id is string => !!id))]
    const { data: customers } = customerIds.length
      ? await client.from('customers').select('id, phone_e164').in('id', customerIds)
      : { data: [] }
    const phones = new Map((customers ?? []).map((c: { id: string; phone_e164: string | null }) => [c.id, c.phone_e164]))
    const facts = read.facts.map((f) => ({ ...f, phoneE164: f.phoneE164 ?? (f.customerId ? phones.get(f.customerId) ?? null : null) }))

    const { data: ledger } = await client
      .from('loyalty_ledger')
      .select('program_id, customer_key, kind, delta, order_backend, external_order_id')
      .eq('tenant_id', tenant.id)
      .gte('created_at', new Date(now.getTime() - days * 86_400_000).toISOString())
    const rows: ShadowLedgerRow[] = (ledger ?? []).map((r: Record<string, unknown>) => ({
      programId: String(r.program_id),
      customerKey: String(r.customer_key),
      kind: String(r.kind),
      delta: Number(r.delta),
      orderBackend: (r.order_backend as string | null) ?? null,
      externalOrderId: (r.external_order_id as string | null) ?? null,
    }))

    const result = reconcileShadowEarning(facts, programs, rows)
    const status = result.missing.length || result.unexpected.length ? 'DIRTY' : 'clean'
    if (status === 'DIRTY') dirty += 1
    console.log(
      `${status.padEnd(5)} ${tenant.name ?? tenant.id}  programs=${programs.length} facts=${facts.length} expected=${result.expectedEntries} recorded=${result.recordedEntries} missing=${result.missing.length} unexpected=${result.unexpected.length}${read.coverage.complete ? '' : `  (coverage: ${read.coverage.note})`}`,
    )
    for (const m of result.missing) console.log(`   missing   ${m.programId} ${m.orderBackend}/${m.externalOrderId} expected ${m.delta} recorded ${m.recordedDelta ?? '—'}`)
    for (const u of result.unexpected) console.log(`   unexpected ${u.programId} ${u.orderBackend}/${u.externalOrderId} recorded ${u.delta}`)
  }
  console.log(`\n${(tenants ?? []).length} tenant(s) checked, ${dirty} dirty.`)
  process.exitCode = dirty > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
