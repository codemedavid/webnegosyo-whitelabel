#!/usr/bin/env node
/**
 * Move a dormant store's order history from its Convex deployment into the
 * shared platform database. This tool only READS (Convex snapshot export,
 * platform SELECTs through the service role) and WRITES FILES; the operator
 * reviews and applies the generated SQL.
 *
 *   npm run convex:import -- export <slug>          snapshot → archive folder (outside the repo)
 *   npm run convex:import -- plan <slug>            counts, peso totals, problems (no customer fields)
 *   npm run convex:import -- sql <slug>             <slug>-import.sql + <slug>-switch.sql in that folder
 *   npm run convex:import -- delta <slug>           after the switch: anything Convex got since
 *   npm run convex:import -- batch-plan --slugs a,b one table over many stores
 *
 * Options: --env <file> (default .env.local: NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY), --dir <export folder> (default: the store's newest).
 * Archive root: $CONVEX_IMPORT_ARCHIVE or ~/Documents/whitelabel-archive/convex-exports.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'
import {
  buildImportPlan,
  buildImportSql,
  buildSwitchSql,
  computeDelta,
  hasBlockingProblem,
  peso,
  renderBatchTable,
  renderPlan,
  type BatchRow,
  type ImportPlan,
} from '@/lib/convex-import'
import { latestExportDir, loadSnapshot, newExportDir, runConvexExport, writePrivate } from './archive'
import { platformClient, readDeployKey, readPlatformState, readTenant } from './platform-reader'

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}

function platformFromEnv(args: string[]) {
  const file = option(args, 'env') ?? process.env.CONVEX_IMPORT_ENV ?? '.env.local'
  const env = existsSync(file) ? parse(readFileSync(file)) : {}
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (looked in ${file} and the environment)`)
  return platformClient(url, key)
}

async function exportStore(args: string[], slug: string, suffix = ''): Promise<string> {
  const db = platformFromEnv(args)
  const tenant = await readTenant(db, slug)
  const key = await readDeployKey(db, tenant.id)
  const dir = newExportDir(slug, suffix)
  const started = Date.now()
  const result = runConvexExport(dir, key)
  const meta = {
    slug,
    tenantId: tenant.id,
    deployment: tenant.convexDeploymentUrl ? new URL(tenant.convexDeploymentUrl).host : null,
    exportedAt: new Date().toISOString(),
    ok: result.ok,
    zipBytes: result.zipBytes,
    seconds: Math.round((Date.now() - started) / 1000),
  }
  writePrivate(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  if (!result.ok) {
    writePrivate(path.join(dir, 'export-error.txt'), result.output)
    throw new Error(`convex export failed for ${slug} (see ${dir}/export-error.txt):\n${result.output.slice(-600)}`)
  }
  const snapshot = loadSnapshot(dir)
  console.log(`${slug}: exported ${result.zipBytes} bytes in ${meta.seconds}s → ${dir}`)
  console.log(`  tables: ${Object.entries(snapshot.tableCounts).map(([t, n]) => `${t} ${n}`).join(', ')}`)
  return dir
}

async function planStore(args: string[], slug: string, dirOverride?: string): Promise<{ plan: ImportPlan; dir: string; deploymentUrl: string | null }> {
  const dir = dirOverride ?? option(args, 'dir') ?? latestExportDir(slug)
  const snapshot = loadSnapshot(dir)
  const db = platformFromEnv(args)
  const platform = await readPlatformState(db, slug, snapshot)
  const plan = buildImportPlan(snapshot, platform)
  writePrivate(path.join(dir, 'plan.json'), JSON.stringify({ madeAt: new Date().toISOString(), summary: plan.summary, problems: plan.problems }, null, 2))
  return { plan, dir, deploymentUrl: platform.tenant.convexDeploymentUrl }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const slug = args.find((arg, i) => !arg.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
  switch (command) {
    case 'export': {
      if (!slug) throw new Error('export <slug>')
      await exportStore(args, slug)
      return
    }
    case 'plan': {
      if (!slug) throw new Error('plan <slug>')
      const { plan, dir } = await planStore(args, slug)
      console.log(renderPlan(plan))
      console.log(`\nplan.json → ${dir}`)
      return
    }
    case 'sql': {
      if (!slug) throw new Error('sql <slug>')
      const { plan, dir, deploymentUrl } = await planStore(args, slug)
      console.log(renderPlan(plan))
      if (hasBlockingProblem(plan)) throw new Error('Blocking problems: no SQL written.')
      const generatedAt = new Date().toISOString()
      const importFile = path.join(dir, `${slug}-import.sql`)
      const switchFile = path.join(dir, `${slug}-switch.sql`)
      writePrivate(importFile, buildImportSql(plan, { generatedAt, sourceLabel: path.basename(dir) }))
      writePrivate(switchFile, buildSwitchSql(plan, { generatedAt, expectedDeploymentUrl: deploymentUrl }))
      writePrivate(path.join(dir, 'import-manifest.json'), JSON.stringify({ generatedAt, slug, snapshotDir: dir, newestCreationTime: plan.summary.newestCreationTime }, null, 2))
      console.log(`\n${importFile}\n${switchFile}`)
      return
    }
    case 'delta': {
      if (!slug) throw new Error('delta <slug>')
      const importedDir = option(args, 'dir') ?? latestExportDir(slug)
      if (!existsSync(path.join(importedDir, 'import-manifest.json'))) throw new Error(`${importedDir} has no import-manifest.json (was sql run there?)`)
      const freshDir = await exportStore(args, slug, '-delta')
      const report = computeDelta(loadSnapshot(importedDir), loadSnapshot(freshDir))
      console.log(`Imported snapshot newest record: ${report.importedNewest ?? '-'}`)
      console.log(`New orders in Convex since: ${report.newOrders.count} (${peso(report.newOrders.cents)}, ${report.newOrders.first ?? '-'} → ${report.newOrders.last ?? '-'})`)
      console.log(`Late payments on imported orders: ${report.latePayments}; late edits: ${report.lateRevisions}`)
      console.log(`Imported orders whose lines changed in Convex: ${report.ordersWithChangedLines} (fix by hand)`)
      console.log(`Imported orders no longer in Convex: ${report.ordersGoneFromConvex}`)
      console.log(report.isEmpty ? 'Nothing new: the import is complete.' : `Re-run: sql ${slug} --dir ${freshDir} (inserts only what is missing)`)
      return
    }
    case 'batch-plan': {
      const slugs = (option(args, 'slugs') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (slugs.length === 0) throw new Error('batch-plan --slugs a,b,c')
      const rows: BatchRow[] = []
      for (const one of slugs) {
        try {
          const { plan } = await planStore(args, one, undefined)
          rows.push({ slug: one, summary: plan.summary, problems: plan.problems })
        } catch (error) {
          rows.push({ slug: one, error: error instanceof Error ? error.message.split('\n')[0] : String(error) })
        }
      }
      console.log(renderBatchTable(rows))
      return
    }
    default:
      console.log('Usage: export <slug> | plan <slug> | sql <slug> | delta <slug> | batch-plan --slugs a,b,c  [--env file] [--dir folder]')
      process.exitCode = command ? 1 : 0
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
