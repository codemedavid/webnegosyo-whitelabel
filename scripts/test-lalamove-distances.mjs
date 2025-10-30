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

function getLanguageForMarket(market) {
  const marketLanguageMap = {
    HK: 'en_HK', SG: 'en_SG', TH: 'th_TH', PH: 'en_PH',
    TW: 'zh_TW', MY: 'ms_MY', VN: 'vi_VN',
  }
  return marketLanguageMap[market] || 'en_US'
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testDistances() {
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

  const pickupLat = tenant.restaurant_latitude
  const pickupLng = tenant.restaurant_longitude
  const market = tenant.lalamove_market
  const service = tenant.lalamove_service_type
  const language = getLanguageForMarket(market)

  console.log('\n🧪 Testing Different Delivery Distances\n')
  console.log(`Pickup: ${tenant.restaurant_address}`)
  console.log(`\nMarket: ${market}, Service: ${service}\n`)

  // Test distances
  const distances = [
    { name: '100m', offset: 0.001 }, // ~100m
    { name: '500m', offset: 0.005 }, // ~500m
    { name: '1km', offset: 0.010 },  // ~1km
    { name: '5km', offset: 0.050 },  // ~5km
    { name: '10km', offset: 0.100 }, // ~10km
  ]

  for (const dist of distances) {
    try {
      const deliveryLat = pickupLat + dist.offset
      const deliveryLng = pickupLng + dist.offset
      
      const quotationPayload = SDKClient.default.QuotationPayloadBuilder
        .quotationPayload()
        .withLanguage(language)
        .withServiceType(service)
        .withStops([
          {
            coordinates: { lat: pickupLat.toString(), lng: pickupLng.toString() },
            address: tenant.restaurant_address,
          },
          {
            coordinates: { lat: deliveryLat.toString(), lng: deliveryLng.toString() },
            address: `Test destination ${dist.name} away`,
          },
        ])
        .build()

      const quotation = await client.Quotation.create(market, quotationPayload)
      console.log(`✅ ${dist.name}: ${quotation.priceBreakdown.total} ${quotation.priceBreakdown.currency}`)
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.log(`❌ ${dist.name}: ${error.message}`)
    }
  }
}

testDistances().catch(error => console.error('Error:', error.message))
