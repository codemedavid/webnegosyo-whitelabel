/**
 * Quick Fix Script - Toggle Sandbox Mode based on credentials
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

async function fixCredentials(slug) {
  console.log(`\n🔧 Fixing credentials for: ${slug}\n`)
  
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !tenant) {
    console.error('❌ Tenant not found:', error?.message)
    return
  }

  const apiKey = tenant.lalamove_api_key
  const isSandboxCredential = apiKey && apiKey.includes('sandbox')
  const currentSandboxMode = tenant.lalamove_sandbox

  console.log(`Current State:`)
  console.log(`  Sandbox Mode: ${currentSandboxMode}`)
  console.log(`  Credential Type: ${isSandboxCredential ? 'SANDBOX' : 'PRODUCTION'}`)
  
  if (isSandboxCredential !== currentSandboxMode) {
    console.log(`\n⚠️  Mismatch detected!`)
    console.log(`\nUpdating Sandbox Mode to: ${isSandboxCredential}`)
    
    const { error: updateError } = await supabase
      .from('tenants')
      .update({ lalamove_sandbox: isSandboxCredential })
      .eq('id', tenant.id)

    if (updateError) {
      console.error('❌ Failed to update:', updateError.message)
    } else {
      console.log('✅ Configuration fixed!')
    }
  } else {
    console.log(`\n✅ Configuration is correct!`)
  }
}

const tenantSlug = process.argv[2] || 'retiro'
fixCredentials(tenantSlug).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
