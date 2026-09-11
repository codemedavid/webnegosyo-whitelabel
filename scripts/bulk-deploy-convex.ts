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
 *   npm run convex:bulk-deploy -- --limit 5 --execute
 *
 * Idempotent: a tenant already on CURRENT_SCHEMA_VERSION is skipped, and a
 * re-push of the same bundle is a no-op on the Convex side. A tenant that fails
 * keeps its old version, so re-running retries exactly the stragglers.
 *
 * Thin I/O glue by design — selection is unit-tested in
 * `@/lib/convex-deploy-selection`, the bundle in `@/lib/convex-push-bundle`.
 */

import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  deployConvexSchema,
  syncTenantConfig,
  validateConvexCredentials,
  CURRENT_SCHEMA_VERSION,
} from '@/lib/convex-deploy'
import { tenantsNeedingDeploy } from '@/lib/convex-deploy-selection'
import { listTenantSecrets } from '@/lib/tenant-secrets'
import {
  buildTenantConfigPayload,
  CONVEX_CONFIG_TENANT_COLUMNS,
  type ConvexTenantConfigSource,
} from '@/lib/convex-tenant-config'

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
  limit: number | null
}

function parseArgs(argv: string[]): Args {
  const valueAfter = (flag: string): string | null => {
    const at = argv.indexOf(flag)
    return at >= 0 && argv[at + 1] ? argv[at + 1] : null
  }
  const limit = valueAfter('--limit')
  return {
    execute: argv.includes('--execute'),
    tenantId: valueAfter('--tenant'),
    limit: limit ? Number(limit) : null,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Every tenant with both a deployment URL and a deploy key, behind the current version. */
async function selectTenants(
  supabase: SupabaseClient,
  args: Args
): Promise<Array<TenantRow & { deployKey: string; config: ConvexTenantConfigSource }>> {
  let query = supabase
    .from('tenants')
    .select(`slug, convex_schema_version, ${CONVEX_CONFIG_TENANT_COLUMNS}`)
    .not('convex_deployment_url', 'is', null)
    .neq('convex_deployment_url', '')
  if (args.tenantId) query = query.eq('id', args.tenantId)

  const { data, error } = await query
  if (error) throw new Error(`Tenant read failed: ${error.message}`)

  const rows = (data ?? []) as unknown as TenantRow[]
  // The deploy key lives in tenant_secrets, which anon is never granted.
  const secrets = await listTenantSecrets(supabase, rows.map((row) => row.id))

  const configured = rows.flatMap((row) => {
    const deployKey = secrets.get(row.id)?.convex_deploy_key?.trim()
    return deployKey ? [{ ...row, deployKey }] : []
  })

  // Version compare lives here, not in the query: the column is TEXT, so a
  // database `lt` compares lexically and "5" sorts above "18".
  const behind = tenantsNeedingDeploy(configured, CURRENT_SCHEMA_VERSION)
  const scoped = args.limit ? behind.slice(0, args.limit) : behind

  return scoped.map((row) => ({
    ...row,
    config: row as unknown as ConvexTenantConfigSource,
  }))
}

async function deployOne(
  supabase: SupabaseClient,
  tenant: { id: string; slug: string; convex_deployment_url: string; deployKey: string; config: ConvexTenantConfigSource }
): Promise<string | null> {
  const valid = await validateConvexCredentials(tenant.convex_deployment_url, tenant.deployKey)
  if (!valid) return 'invalid deploy key or URL'

  const deployed = await deployConvexSchema(tenant.deployKey, tenant.convex_deployment_url)
  if (!deployed.success) return `schema push failed: ${deployed.error}`

  // Same payload the tenant-save path pushes, so a deploy and a settings save
  // can never leave the deployment holding different values.
  const synced = await syncTenantConfig(
    tenant.convex_deployment_url,
    tenant.deployKey,
    buildTenantConfigPayload(tenant.config)
  )
  if (!synced) return 'schema deployed but tenantConfig sync failed'

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

  const tenants = await selectTenants(supabase, args)
  console.log(`Target schema version: v${CURRENT_SCHEMA_VERSION}`)
  console.log(`Deployments behind: ${tenants.length}`)
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
    try {
      const failure = await deployOne(supabase, tenant)
      if (failure) {
        failures.push(`${tenant.slug}: ${failure}`)
        console.log(`${label} ✗ ${failure}`)
      } else {
        deployed++
        console.log(`${label} ✓ v${CURRENT_SCHEMA_VERSION}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${tenant.slug}: ${message}`)
      console.log(`${label} ✗ ${message}`)
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
  console.error(error)
  process.exit(1)
})
