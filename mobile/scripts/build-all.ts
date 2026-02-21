/**
 * Build apps for ALL active tenants.
 *
 * Usage: npx tsx scripts/build-all.ts [--platform ios|android|all] [--profile production] [--concurrency 3] [--submit]
 *
 * Fetches all active tenants from Supabase, then runs build-tenant.ts
 * for each one with a configurable concurrency limit.
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface BuildResult {
  slug: string
  name: string
  success: boolean
  error?: string
  duration: number
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function buildAll() {
  const args = process.argv.slice(2)
  let platform = 'all'
  let profile = 'production'
  let concurrency = 3
  let submit = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) { platform = args[i + 1]; i++ }
    else if (args[i] === '--profile' && args[i + 1]) { profile = args[i + 1]; i++ }
    else if (args[i] === '--concurrency' && args[i + 1]) { concurrency = parseInt(args[i + 1]); i++ }
    else if (args[i] === '--submit') { submit = true }
  }

  // Fetch all active tenants
  console.log('Fetching active tenants...')
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('slug, name')
    .eq('is_active', true)
    .order('name')

  if (error || !tenants) {
    console.error('Failed to fetch tenants:', error?.message)
    process.exit(1)
  }

  console.log(`Found ${tenants.length} active tenants`)
  console.log(`Concurrency: ${concurrency} | Platform: ${platform} | Profile: ${profile}\n`)

  const results: BuildResult[] = []
  const startTime = Date.now()

  // Process in batches
  for (let i = 0; i < tenants.length; i += concurrency) {
    const batch = tenants.slice(i, i + concurrency)
    console.log(`\n--- Batch ${Math.floor(i / concurrency) + 1} (${batch.map(t => t.slug).join(', ')}) ---\n`)

    const batchPromises = batch.map(async (tenant) => {
      const tenantStart = Date.now()
      try {
        const submitFlag = submit ? '--submit' : ''
        const cmd = `npx tsx scripts/build-tenant.ts ${tenant.slug} --platform ${platform} --profile ${profile} ${submitFlag}`
        execSync(cmd, { stdio: 'inherit', cwd: __dirname + '/..' })
        return {
          slug: tenant.slug,
          name: tenant.name,
          success: true,
          duration: Date.now() - tenantStart,
        }
      } catch (err) {
        return {
          slug: tenant.slug,
          name: tenant.name,
          success: false,
          error: String(err),
          duration: Date.now() - tenantStart,
        }
      }
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    // Brief pause between batches to avoid rate limits
    if (i + concurrency < tenants.length) {
      await sleep(5000)
    }
  }

  // Generate report
  const totalDuration = Date.now() - startTime
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  const report = {
    timestamp: new Date().toISOString(),
    platform,
    profile,
    totalTenants: tenants.length,
    successful: successful.length,
    failed: failed.length,
    totalDuration: `${Math.round(totalDuration / 1000)}s`,
    results,
  }

  const reportPath = path.join(__dirname, '..', 'build-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\n========================================')
  console.log('BUILD REPORT')
  console.log('========================================')
  console.log(`Total: ${tenants.length} | Success: ${successful.length} | Failed: ${failed.length}`)
  console.log(`Duration: ${Math.round(totalDuration / 1000)}s`)
  if (failed.length > 0) {
    console.log('\nFailed tenants:')
    failed.forEach(f => console.log(`  - ${f.slug}: ${f.error}`))
  }
  console.log(`\nFull report: ${reportPath}`)
}

buildAll().catch(err => {
  console.error('Build-all failed:', err)
  process.exit(1)
})
