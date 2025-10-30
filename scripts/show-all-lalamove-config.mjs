import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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

async function showConfig() {
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('slug, name, lalamove_enabled, lalamove_sandbox, lalamove_api_key, lalamove_secret_key, lalamove_market, lalamove_service_type')
    .order('name')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('\n📋 All Tenants Lalamove Configuration:\n')
  
  for (const tenant of tenants) {
    console.log(`${tenant.name} (${tenant.slug}):`)
    console.log(`  Enabled: ${tenant.lalamove_enabled}`)
    if (tenant.lalamove_enabled) {
      console.log(`  Sandbox: ${tenant.lalamove_sandbox}`)
      console.log(`  Market: ${tenant.lalamove_market}`)
      console.log(`  Service: ${tenant.lalamove_service_type}`)
      const apiType = tenant.lalamove_api_key ? (tenant.lalamove_api_key.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION') : 'None'
      const matches = (tenant.lalamove_api_key && tenant.lalamove_api_key.includes('sandbox')) === tenant.lalamove_sandbox
      console.log(`  API Key Type: ${apiType} ${matches ? '✅' : '❌ MISMATCH'}`)
      console.log(`  Has Credentials: ${!!tenant.lalamove_api_key && !!tenant.lalamove_secret_key}`)
    }
    console.log('')
  }
}

showConfig().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
