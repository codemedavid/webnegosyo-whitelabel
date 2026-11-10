#!/usr/bin/env node
/**
 * Push the current Convex template to every tenant deployment that is behind.
 *
 * The superadmin dashboard already has this button (`bulkDeployConvexAction`),
 * but it runs inside a request and dies with it — 100+ deployments is well past
 * what one serverless invocation survives. This is the same selection and the
 * same deploy calls, driven from a terminal that can take its time, so a
 * security-relevant template version (v28's `requireAccess` gate) can be rolled
 * out without babysitting a browser tab.
 *
 * DRY-RUN BY DEFAULT — prints what it would push and writes nothing. Pass
 * `--execute` to deploy.
 *
 *   npm run convex:bulk-deploy
 *   npm run convex:bulk-deploy -- --execute
 *   npm run convex:bulk-deploy -- --tenant <id> --execute
 *   npm run convex:bulk-deploy -- --tenants slug-a,slug-b --execute
 *   npm run convex:bulk-deploy -- --tenants slug-a --dry-run
 *   npm run convex:bulk-deploy -- --limit 5 --execute
 *
 * Idempotent: a tenant already on CURRENT_SCHEMA_VERSION is skipped, and a
 * re-push of the same bundle is a no-op on the Convex side. A tenant that fails
 * keeps its old version, so re-running retries exactly the stragglers.
 *
 * Prints one result per store and exits non-zero if any failed or any named
 * store does not exist. Secrets are scrubbed from whatever a failure quotes.
 *
 * Thin I/O glue by design — selection is unit-tested in
 * `@/lib/convex-deploy-selection`, the bundle in `@/lib/convex-push-bundle`.
 */

import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  deployConvexSchema,
  validateConvexCredentials,
  CURRENT_SCHEMA_VERSION,
} from '@/lib/convex-deploy'
import { syncTenantConvexConfig } from '@/lib/convex-config-sync'
import { tenantsNeedingDeploy } from '@/lib/convex-deploy-selection'
import { parseTenantList, redactSecrets } from '@/lib/convex-enforcement'
import { listTenantSecrets } from '@/lib/tenant-secrets'

// A 100-deployment sweep is long enough that nobody wants to export the service
// key by hand first; read the same file `next dev` does.
loadEnv({ path: '.env.local' })

/** Pause between deployments so a 100-tenant sweep doesn't trip Convex rate limits. */
const DEPLOY_GAP_MS = 750

interface TenantRow {
  id: string
  slug: string
  convex_deployment_url: string
  convex_schema_version?: string | null
}

interface Args {
  execute: boolean
  tenantId: string | null
  /** Slugs from `--tenants`, for a stage rollout. Empty = every store behind. */
  slugs: string[]
  limit: number | null
}

interface SelectedTenant extends TenantRow {
  deployKey: string
  /** Every secret on file for the store, to scrub from anything printed. */
  secrets: Array<string | null | undefined>
}

function parseArgs(argv: string[]): Args {
  const valueAfter = (flag: string): string | null => {
    const at = argv.indexOf(flag)
    return at >= 0 && argv[at + 1] ? argv[at + 1] : null
  }
  const limit = valueAfter('--limit')
  return {
    // `--dry-run` wins, so adding it to a command can only make it safer.
    execute: argv.includes('--execute') && !argv.includes('--dry-run'),
    tenantId: valueAfter('--tenant'),
    slugs: parseTenantList(valueAfter('--tenants')),
    limit: limit ? Number(limit) : null,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Named stores that can't be selected, each with the reason. */
type Skipped = string[]

/** Every tenant with both a deployment URL and a deploy key, behind the current version. */
async function selectTenants(
  supabase: SupabaseClient,
  args: Args
): Promise<{ tenants: SelectedTenant[]; skipped: Skipped }> {
  let query = supabase
    .from('tenants')
    .select('id, slug, convex_deployment_url, convex_schema_version')
    .not('convex_deployment_url', 'is', null)
    .neq('convex_deployment_url', '')
  if (args.tenantId) query = query.eq('id', args.tenantId)
  if (args.slugs.length) query = query.in('slug', args.slugs)

  const { data, error } = await query
  if (error) throw new Error(`Tenant read failed: ${error.message}`)

  const rows = (data ?? []) as unknown as TenantRow[]
  // The deploy key lives in tenant_secrets, which anon is never granted.
  const secrets = await listTenantSecrets(supabase, rows.map((row) => row.id))

  const configured = rows.flatMap((row) => {
    const held = secrets.get(row.id)
    const deployKey = held?.convex_deploy_key?.trim()
    return deployKey ? [{ ...row, deployKey, secrets: Object.values(held ?? {}) }] : []
  })

  // A store named on the command line that drops out must not pass in silence:
  // a stage rollout would look finished with a store missing.
  const configuredSlugs = new Set(configured.map((row) => row.slug))
  const skipped = args.slugs
    .filter((slug) => !configuredSlugs.has(slug))
    .map((slug) => `${slug}: no such store, or no Convex deployment and deploy key on file`)

  // Version compare lives here, not in the query: the column is TEXT, so a
  // database `lt` compares lexically and "5" sorts above "18".
  const behind = tenantsNeedingDeploy(configured, CURRENT_SCHEMA_VERSION)
  return { tenants: args.limit ? behind.slice(0, args.limit) : behind, skipped }
}

async function deployOne(supabase: SupabaseClient, tenant: SelectedTenant): Promise<string | null> {
  const valid = await validateConvexCredentials(tenant.convex_deployment_url, tenant.deployKey)
  if (!valid) return 'invalid deploy key or URL'

  const deployed = await deployConvexSchema(tenant.deployKey, tenant.convex_deployment_url)
  if (!deployed.success) return `schema push failed: ${deployed.error}`

  // The one sync every settings save uses: secrets merged in, business-day
  // entry included. A payload built here without them once would have blanked
  // the store's Lalamove keys, because the config emits every key it knows.
  const synced = await syncTenantConvexConfig(tenant.id)
  if (synced.status !== 'synced') {
    const reason = synced.status === 'failed' ? synced.error : synced.reason
    return `schema deployed but tenantConfig sync failed: ${reason}`
  }

  const { error } = await supabase
    .from('tenants')
    .update({ convex_schema_version: String(CURRENT_SCHEMA_VERSION) })
    .eq('id', tenant.id)
  if (error) return `deployed but version not recorded: ${error.message}`

  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  )

  const { tenants, skipped } = await selectTenants(supabase, args)
  console.log(`Target schema version: v${CURRENT_SCHEMA_VERSION}`)
  console.log(`Deployments behind: ${tenants.length}`)
  for (const line of skipped) console.log(`  ✗ ${line}`)
  if (skipped.length) process.exitCode = 1
  if (!tenants.length) return

  if (!args.execute) {
    for (const tenant of tenants) {
      console.log(`  would deploy ${tenant.slug} (v${tenant.convex_schema_version ?? '—'} → v${CURRENT_SCHEMA_VERSION})`)
    }
    console.log('\nDRY RUN — nothing was pushed. Re-run with --execute.')
    return
  }

  let deployed = 0
  const failures: string[] = []

  for (const [index, tenant] of tenants.entries()) {
    const label = `[${index + 1}/${tenants.length}] ${tenant.slug}`
    let failure: string | null
    try {
      failure = await deployOne(supabase, tenant)
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (failure) {
      const safe = redactSecrets(failure, tenant.secrets)
      failures.push(`${tenant.slug}: ${safe}`)
      console.log(`${label} ✗ ${safe}`)
    } else {
      deployed++
      console.log(`${label} ✓ v${CURRENT_SCHEMA_VERSION}`)
    }
    if (index < tenants.length - 1) await sleep(DEPLOY_GAP_MS)
  }

  console.log(`\nDeployed ${deployed}/${tenants.length}.`)
  if (failures.length) {
    console.log(`Failed ${failures.length} — re-run to retry just these:`)
    for (const failure of failures) console.log(`  ${failure}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
