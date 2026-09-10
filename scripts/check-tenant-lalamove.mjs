/**
 * Check Tenant Lalamove Configuration
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load environment variables
let supabaseUrl, supabaseKey
try {
  const envContent = readFileSync('.env.local', 'utf-8')
  const envLines = envContent.split('\n')
  for (const line of envLines) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = value
      if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') supabaseKey = value
    }
  }
} catch (error) {
  console.error('Failed to read .env.local:', error.message)
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTenant(slug) {
  console.log(`\n📋 Checking tenant: ${slug}\n`)
  
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*, tenant_secrets(lalamove_api_key, lalamove_secret_key)')
    .eq('slug', slug)
    .single()
  // Secrets live in tenant_secrets now; flatten so the checks below read as before.
  if (tenant) Object.assign(tenant, tenant.tenant_secrets ?? {})

  if (error || !tenant) {
    console.error('❌ Tenant not found:', error?.message)
    return
  }

  console.log(`Tenant: ${tenant.name}`)
  console.log(`\nLalamove Configuration:`)
  console.log(`  Enabled: ${tenant.lalamove_enabled}`)
  console.log(`  Sandbox Mode: ${tenant.lalamove_sandbox}`)
  console.log(`  Market: ${tenant.lalamove_market}`)
  console.log(`  Service Type: ${tenant.lalamove_service_type}`)
  console.log(`\nCredentials:`)
  console.log(`  API Key: ${tenant.lalamove_api_key ? tenant.lalamove_api_key.substring(0, 15) + '...' : 'Not set'}`)
  console.log(`  API Key Type: ${tenant.lalamove_api_key ? (tenant.lalamove_api_key.includes('sandbox') ? 'SANDBOX ✅' : 'PRODUCTION ❌ (mismatch!)') : 'N/A'}`)
  console.log(`  Secret Key: ${tenant.lalamove_secret_key ? tenant.lalamove_secret_key.substring(0, 15) + '...' : 'Not set'}`)
  console.log(`  Secret Key Type: ${tenant.lalamove_secret_key ? (tenant.lalamove_secret_key.includes('sandbox') ? 'SANDBOX ✅' : 'PRODUCTION ❌ (mismatch!)') : 'N/A'}`)
  console.log(`\nRestaurant Address:`)
  console.log(`  Address: ${tenant.restaurant_address || 'Not set'}`)
  console.log(`  Latitude: ${tenant.restaurant_latitude || 'Not set'}`)
  console.log(`  Longitude: ${tenant.restaurant_longitude || 'Not set'}`)
  
  // Check for mismatches
  console.log(`\n⚠️  Configuration Check:`)
  if (tenant.lalamove_sandbox && tenant.lalamove_api_key && !tenant.lalamove_api_key.includes('sandbox')) {
    console.log(`  ❌ MISMATCH: Sandbox mode is ON but API key is PRODUCTION type`)
    console.log(`  🔧 Solution: Set Sandbox Mode to OFF or use sandbox credentials`)
  }
  if (!tenant.lalamove_sandbox && tenant.lalamove_api_key && tenant.lalamove_api_key.includes('sandbox')) {
    console.log(`  ❌ MISMATCH: Sandbox mode is OFF but API key is SANDBOX type`)
    console.log(`  🔧 Solution: Set Sandbox Mode to ON or use production credentials`)
  }
  if (tenant.lalamove_sandbox && tenant.lalamove_secret_key && !tenant.lalamove_secret_key.includes('sandbox')) {
    console.log(`  ❌ MISMATCH: Sandbox mode is ON but Secret key is PRODUCTION type`)
  }
  if (!tenant.lalamove_sandbox && tenant.lalamove_secret_key && tenant.lalamove_secret_key.includes('sandbox')) {
    console.log(`  ❌ MISMATCH: Sandbox mode is OFF but Secret key is SANDBOX type`)
  }
}

const tenantSlug = process.argv[2] || 'retiro'
checkTenant(tenantSlug).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
