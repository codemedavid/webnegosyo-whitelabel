import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

let supabaseUrl, supabaseKey, supabaseServiceKey
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
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = value
    }
  }
} catch (error) {
  console.error('Failed to read .env.local:', error.message)
}

if (!supabaseUrl) {
  console.error('❌ Missing Supabase URL')
  process.exit(1)
}

// Use service role key if available, otherwise anon key
const keyToUse = supabaseServiceKey || supabaseKey
const supabase = createClient(supabaseUrl, keyToUse)

async function manualFix(slug) {
  console.log(`\n🔧 Manually fixing sandbox mode for: ${slug}\n`)
  
  // First, get the tenant
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
  
  console.log(`Current state:`)
  console.log(`  Sandbox Mode: ${tenant.lalamove_sandbox}`)
  console.log(`  Credential Type: ${isSandboxCredential ? 'SANDBOX' : 'PRODUCTION'}`)
  console.log(`\nSettings Sandbox Mode to: ${isSandboxCredential}\n`)
  
  const { data, error: updateError } = await supabase
    .from('tenants')
    .update({ lalamove_sandbox: isSandboxCredential })
    .eq('id', tenant.id)
    .select()

  if (updateError) {
    console.error('❌ Failed to update:', updateError.message)
    console.error('Full error:', updateError)
  } else {
    console.log('✅ Successfully updated!')
    console.log('Updated record:', data[0].lalamove_sandbox)
    
    // Verify
    const { data: verify } = await supabase
      .from('tenants')
      .select('lalamove_sandbox')
      .eq('slug', slug)
      .single()
    
    console.log('Verification:', verify)
  }
}

const tenantSlug = process.argv[2] || 'retiro'
manualFix(tenantSlug).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
