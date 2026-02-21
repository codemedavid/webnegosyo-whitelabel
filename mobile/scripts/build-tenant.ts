/**
 * Build a single tenant's app.
 *
 * Usage: npx tsx scripts/build-tenant.ts <tenant-slug> [--platform ios|android|all] [--profile production|preview]
 *
 * Steps:
 * 1. Query Supabase for tenant record
 * 2. Download logo and generate icon/splash assets via Sharp
 * 3. Set environment variables for app.config.ts
 * 4. Run EAS Build
 * 5. Optionally run EAS Submit
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { generateIcons } from './generate-icons'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface BuildOptions {
  slug: string
  platform: 'ios' | 'android' | 'all'
  profile: string
  submit: boolean
}

function parseArgs(): BuildOptions {
  const args = process.argv.slice(2)
  const slug = args[0]

  if (!slug) {
    console.error('Usage: npx tsx scripts/build-tenant.ts <tenant-slug> [--platform ios|android|all] [--profile production|preview] [--submit]')
    process.exit(1)
  }

  let platform: 'ios' | 'android' | 'all' = 'all'
  let profile = 'production'
  let submit = false

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[i + 1] as 'ios' | 'android' | 'all'
      i++
    } else if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1]
      i++
    } else if (args[i] === '--submit') {
      submit = true
    }
  }

  return { slug, platform, profile, submit }
}

async function buildTenant(options: BuildOptions) {
  const { slug, platform, profile, submit } = options

  console.log(`\n========================================`)
  console.log(`Building app for tenant: ${slug}`)
  console.log(`Platform: ${platform} | Profile: ${profile}`)
  console.log(`========================================\n`)

  // 1. Fetch tenant from Supabase
  console.log('Fetching tenant data...')
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color, is_active')
    .eq('slug', slug)
    .single()

  if (error || !tenant) {
    console.error(`Tenant "${slug}" not found:`, error?.message)
    process.exit(1)
  }

  if (!tenant.is_active) {
    console.error(`Tenant "${slug}" is not active. Skipping.`)
    process.exit(1)
  }

  console.log(`Tenant: ${tenant.name} (${tenant.id})`)

  // 2. Generate icon and splash assets
  if (tenant.logo_url) {
    console.log('\nGenerating app icons and splash screen...')
    await generateIcons(slug, tenant.logo_url, tenant.primary_color || '#111111')
  } else {
    console.warn('No logo_url found. Using default assets.')
  }

  // 3. Set environment variables
  const env = {
    ...process.env,
    TENANT_SLUG: slug,
    TENANT_NAME: tenant.name,
    TENANT_ID: tenant.id,
    TENANT_PRIMARY_COLOR: tenant.primary_color || '#111111',
  }

  // 4. Run EAS Build
  console.log('\nStarting EAS Build...')
  const buildCmd = `npx eas-cli build --platform ${platform} --profile ${profile} --non-interactive`
  try {
    execSync(buildCmd, { env, stdio: 'inherit', cwd: __dirname + '/..' })
  } catch (err) {
    console.error('EAS Build failed')
    process.exit(1)
  }

  // 5. Optionally submit
  if (submit) {
    console.log('\nSubmitting to stores...')
    const submitCmd = `npx eas-cli submit --platform ${platform} --profile ${profile} --non-interactive`
    try {
      execSync(submitCmd, { env, stdio: 'inherit', cwd: __dirname + '/..' })
    } catch (err) {
      console.error('EAS Submit failed (build was successful)')
    }
  }

  console.log(`\nBuild complete for ${tenant.name} (${slug})`)
  return { slug, name: tenant.name, success: true }
}

// Run
const options = parseArgs()
buildTenant(options).catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
