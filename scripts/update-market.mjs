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
} catch (error) {}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey)

async function updateMarket(slug, market) {
  console.log(`\n🔧 Updating market for ${slug} to ${market}\n`)
  
  const { data, error } = await supabase
    .from('tenants')
    .update({ lalamove_market: market })
    .eq('slug', slug)
    .select()

  if (error) {
    console.error('❌ Error:', error.message)
  } else {
    console.log('✅ Updated successfully!')
    console.log('New market:', data[0].lalamove_market)
  }
}

const slug = process.argv[2] || 'retiro'
const market = process.argv[3] || 'PH'

updateMarket(slug, market)
