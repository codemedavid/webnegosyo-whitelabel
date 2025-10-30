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
} catch (error) {}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testHK() {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'retiro')
    .single()

  const SDKClient = await import('@lalamove/lalamove-js')
  
  const client = new SDKClient.default.ClientModule(
    new SDKClient.default.Config(
      tenant.lalamove_api_key,
      tenant.lalamove_secret_key,
      'production'
    )
  )

  // Use Hong Kong test addresses with correct language
  const quotationPayload = SDKClient.default.QuotationPayloadBuilder
    .quotationPayload()
    .withLanguage('en_HK')
    .withServiceType('MOTORCYCLE')
    .withStops([
      {
        coordinates: { lat: '22.3193', lng: '114.1694' },
        address: 'Times Square, Causeway Bay, Hong Kong',
      },
      {
        coordinates: { lat: '22.2819', lng: '114.1556' },
        address: 'Central, Hong Kong',
      },
    ])
    .build()

  console.log('📤 Testing with Hong Kong addresses (en_HK)...')
  const quotation = await client.Quotation.create('HK', quotationPayload)
  
  console.log('✅ SUCCESS! Quotation created!')
  console.log(`   ID: ${quotation.id}`)
  console.log(`   Price: ${quotation.priceBreakdown.total} ${quotation.priceBreakdown.currency}`)
}

testHK().catch(error => {
  console.error('❌ Error:', error.message)
})
