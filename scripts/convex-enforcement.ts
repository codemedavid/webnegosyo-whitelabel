#!/usr/bin/env node
/**
 * Turn `auth_enforced` on, store by store, and prove it took.
 *
 *   npm run convex:enforcement -- status [--tenants a,b,c | --backend platform | --all]
 *   npm run convex:enforcement -- enforce --tenants a,b,c [--dry-run] [--force]
 *   npm run convex:enforcement -- rollback --tenants a,b,c [--dry-run]
 *   npm run convex:enforcement -- audit --tenants a,b,c [--days 7]
 *
 * `enforce` refuses a store below v28, a deployment that is down, or (v40+) one
 * whose counter saw tokenless writes in the last week unless --force. It sets the
 * flag, syncs the store's config at once and asserts an anonymous read is now
 * refused. A failed sync or an open probe puts the flag back. A store with
 * `convex_public_reads` (the demo) keeps answering anonymous reads by design.
 *
 * Prints one word for a probe and counts for an audit: never an order, never a
 * secret. Exits non-zero if any store failed.
 *
 * Thin I/O glue by design. The decisions are unit-tested in
 * `@/lib/convex-enforcement`.
 */

import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createConvexServerClient } from '@/lib/convex/server'
import { syncTenantConvexConfig } from '@/lib/convex-config-sync'
import {
  enforceStore,
  parseEnforcementArgs,
  probeAnonymously,
  redactSecrets,
  rollbackStore,
  selectStores,
  type EnforceTarget,
  type EnforcementDeps,
  type StoreResult,
  type StoreSelector,
} from '@/lib/convex-enforcement'
import type { OrderBackendPreference } from '@/lib/order-backend'
import { listTenantSecrets } from '@/lib/tenant-secrets'

// Read the same file `next dev` does, like the sibling Convex scripts.
loadEnv({ path: '.env.local' })

/** How far back a tokenless write stops a store being enforced. */
const TOKENLESS_WINDOW_DAYS = 7

/** Pause between stores so a long list doesn't trip Convex rate limits. */
const STORE_GAP_MS = 500

interface TenantRow {
  id: string
  slug: string
  order_backend: OrderBackendPreference | null
  convex_deployment_url: string | null
  convex_schema_version: string | null
  convex_auth_enforced: boolean | null
  convex_public_reads: boolean | null
}

interface Store {
  row: TenantRow
  target: EnforceTarget
  deployKey: string | null
  /** Every secret on file for the store, to scrub from anything printed. */
  secrets: Array<string | null | undefined>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

/** Selected stores, plus any named slug that does not exist. */
async function loadStores(
  supabase: SupabaseClient,
  selector: StoreSelector
): Promise<{ stores: Store[]; unknownSlugs: string[] }> {
  let query = supabase
    .from('tenants')
    .select(
      'id, slug, order_backend, convex_deployment_url, convex_schema_version, convex_auth_enforced, convex_public_reads'
    )
  query =
    selector.kind === 'tenants'
      ? query.in('slug', selector.slugs)
      : query.not('convex_deployment_url', 'is', null).neq('convex_deployment_url', '')

  const { data, error } = await query.order('slug')
  if (error) throw new Error(`Tenant read failed: ${error.message}`)

  const { selected, unknownSlugs } = selectStores((data ?? []) as unknown as TenantRow[], selector)
  const secrets = await listTenantSecrets(supabase, selected.map((row) => row.id))

  const stores = selected.map((row): Store => {
    const held = secrets.get(row.id)
    const deployKey = held?.convex_deploy_key?.trim() || null
    return {
      row,
      deployKey,
      secrets: held ? Object.values(held) : [],
      target: {
        slug: row.slug,
        hasDeployment: Boolean(row.convex_deployment_url && deployKey),
        deployedVersion: row.convex_schema_version,
        authEnforced: row.convex_auth_enforced === true,
        publicReads: row.convex_public_reads === true,
      },
    }
  })
  return { stores, unknownSlugs }
}

function depsFor(supabase: SupabaseClient, store: Store): EnforcementDeps {
  return {
    probe: () => probeAnonymously(store.row.convex_deployment_url ?? ''),
    setFlag: async (enforced) => {
      // RLS and guards refuse with zero rows and no error, so check the row.
      const { data, error } = await supabase
        .from('tenants')
        .update({ convex_auth_enforced: enforced })
        .eq('id', store.row.id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('no row updated')
    },
    sync: () => syncTenantConvexConfig(store.row.id),
    tokenlessWrites: async () => {
      if (!store.row.convex_deployment_url || !store.deployKey) return null
      try {
        const convex = createConvexServerClient(store.row.convex_deployment_url, store.deployKey)
        const rows = await convex.query<AuditRow[]>('auth:getAccessAudit', { days: TOKENLESS_WINDOW_DAYS })
        return rows.reduce((sum, row) => sum + row.tokenless, 0)
      } catch {
        return null // Below v40: the function doesn't exist yet.
      }
    },
  }
}

async function printStatus(stores: readonly Store[]): Promise<void> {
  for (const [index, store] of stores.entries()) {
    const probe = store.row.convex_deployment_url
      ? await probeAnonymously(store.row.convex_deployment_url)
      : 'down'
    const flag = store.target.authEnforced ? 'on ' : 'off'
    const version = `v${store.row.convex_schema_version ?? '?'}`.padEnd(5)
    const reads = store.target.publicReads ? '  public-reads' : ''
    console.log(`${store.row.slug.padEnd(32)} flag:${flag}  ${version} ${probe}${reads}`)
    if (index < stores.length - 1) await sleep(STORE_GAP_MS)
  }
}

async function changeStores(
  stores: readonly Store[],
  change: (store: Store) => Promise<StoreResult>
): Promise<number> {
  let failed = 0
  for (const [index, store] of stores.entries()) {
    let result: StoreResult
    try {
      result = await change(store)
    } catch (error) {
      result = { ok: false, detail: error instanceof Error ? error.message : String(error), notes: [] }
    }
    if (!result.ok) failed += 1
    console.log(`${store.row.slug}: ${result.ok ? 'OK' : 'FAILED'} ${redactSecrets(result.detail, store.secrets)}`)
    for (const note of result.notes) console.log(`  note: ${note}`)
    if (index < stores.length - 1) await sleep(STORE_GAP_MS)
  }
  return failed
}

interface AuditRow {
  day: string
  fn: string
  tokenless: number
  withToken: number
}

async function printAudit(stores: readonly Store[], days: number): Promise<number> {
  let failed = 0
  for (const store of stores) {
    if (!store.row.convex_deployment_url || !store.deployKey) {
      console.log(`${store.row.slug}: FAILED no Convex deployment or deploy key on file`)
      failed += 1
      continue
    }
    try {
      const convex = createConvexServerClient(store.row.convex_deployment_url, store.deployKey)
      const rows = await convex.query<AuditRow[]>('auth:getAccessAudit', { days })
      const tokenless = rows.reduce((sum, row) => sum + row.tokenless, 0)
      const withToken = rows.reduce((sum, row) => sum + row.withToken, 0)
      console.log(`${store.row.slug}: last ${days}d tokenless=${tokenless} withToken=${withToken}`)
      for (const row of rows) {
        console.log(`  ${row.day}  ${row.fn.padEnd(36)} tokenless=${row.tokenless} withToken=${row.withToken}`)
      }
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${store.row.slug}: FAILED ${redactSecrets(message, store.secrets)} (v40+ only)`)
    }
  }
  return failed
}

async function main() {
  const args = parseEnforcementArgs(process.argv.slice(2))
  if ('error' in args) {
    console.error(args.error)
    process.exitCode = 1
    return
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  const { stores, unknownSlugs } = await loadStores(supabase, args.selector)
  for (const slug of unknownSlugs) console.log(`${slug}: FAILED no such store`)
  let failed = unknownSlugs.length

  if (args.command === 'status') {
    await printStatus(stores)
  } else if (args.command === 'audit') {
    failed += await printAudit(stores, args.days)
  } else {
    if (args.dryRun) console.log('DRY RUN: nothing will be changed.')
    const run = args.command === 'enforce' ? enforceStore : rollbackStore
    failed += await changeStores(stores, (store) =>
      run(store.target, depsFor(supabase, store), { dryRun: args.dryRun, force: args.force })
    )
  }

  console.log(`\n${stores.length} store(s), ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
