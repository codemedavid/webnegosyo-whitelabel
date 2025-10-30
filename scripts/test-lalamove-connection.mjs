/**
 * Test Lalamove Connection Script
 * Tests the Lalamove integration with configured tenant credentials
 */

import { createClient } from '@supabase/supabase-js'

// Load environment variables from .env.local
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

// Get language code for Lalamove based on market
function getLanguageForMarket(market) {
  const marketLanguageMap = {
    HK: 'en_HK',
    SG: 'en_SG',
    TH: 'th_TH',
    PH: 'en_PH',
    TW: 'zh_TW',
    MY: 'ms_MY',
    VN: 'vi_VN',
  }
  return marketLanguageMap[market] || 'en_US'
}

async function testLalamove() {
  console.log('🔍 Testing Lalamove Integration...\n')

  // Connect to Supabase
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get tenant data
  const tenantSlug = process.argv[2] || 'retiro'
  console.log(`📋 Fetching tenant data for: ${tenantSlug}`)

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single()

  if (tenantError || !tenant) {
    console.error('❌ Failed to fetch tenant:', tenantError?.message)
    console.log('\nAvailable tenants:')
    const { data: tenants } = await supabase.from('tenants').select('slug, name')
    tenants?.forEach(t => console.log(`  - ${t.slug} (${t.name})`))
    process.exit(1)
  }

  console.log(`✅ Tenant found: ${tenant.name}`)
  console.log(`   Lalamove enabled: ${tenant.lalamove_enabled}`)
  console.log(`   Sandbox mode: ${tenant.lalamove_sandbox}`)
  console.log(`   Market: ${tenant.lalamove_market}`)
  console.log(`   Service: ${tenant.lalamove_service_type}`)
  console.log(`   Has API Key: ${!!tenant.lalamove_api_key}`)
  console.log(`   Has Secret Key: ${!!tenant.lalamove_secret_key}`)
  console.log(`   Has Restaurant Address: ${!!tenant.restaurant_address}`)
  
  if (!tenant.lalamove_enabled) {
    console.error('\n❌ Lalamove is not enabled for this tenant')
    process.exit(1)
  }

  if (!tenant.lalamove_api_key || !tenant.lalamove_secret_key) {
    console.error('\n❌ Missing Lalamove credentials')
    process.exit(1)
  }

  // Test Lalamove SDK initialization
  console.log('\n🔧 Testing Lalamove SDK initialization...')
  try {
    const SDKClient = await import('@lalamove/lalamove-js')
    const environment = tenant.lalamove_sandbox ? 'sandbox' : 'production'
    
    console.log(`   Environment: ${environment}`)
    console.log(`   API Key prefix: ${tenant.lalamove_api_key.substring(0, 12)}...`)
    
    const client = new SDKClient.default.ClientModule(
      new SDKClient.default.Config(
        tenant.lalamove_api_key,
        tenant.lalamove_secret_key,
        environment
      )
    )
    
    console.log('✅ Lalamove client initialized')
  } catch (error) {
    console.error('❌ Failed to initialize Lalamove client:', error.message)
    process.exit(1)
  }

  // Test quotation creation if restaurant address is configured
  if (tenant.restaurant_address && tenant.restaurant_latitude && tenant.restaurant_longitude) {
    console.log('\n🧪 Testing quotation creation...')
    try {
      const SDKClient = await import('@lalamove/lalamove-js')
      const environment = tenant.lalamove_sandbox ? 'sandbox' : 'production'
      const market = tenant.lalamove_market || 'HK'
      const service = tenant.lalamove_service_type || 'MOTORCYCLE'
      
      const client = new SDKClient.default.ClientModule(
        new SDKClient.default.Config(
          tenant.lalamove_api_key,
          tenant.lalamove_secret_key,
          environment
        )
      )

      // Test addresses
      const pickupAddress = tenant.restaurant_address
      const pickupLat = tenant.restaurant_latitude
      const pickupLng = tenant.restaurant_longitude
      
      // Use a nearby delivery address for testing (adjust for your location)
      const deliveryAddress = pickupAddress // Same address for testing
      const deliveryLat = pickupLat + 0.001 // ~100m away
      const deliveryLng = pickupLng + 0.001

      console.log(`   Market: ${market}`)
      console.log(`   Service: ${service}`)
      console.log(`   Pickup: ${pickupAddress}`)
      console.log(`   Delivery: ${deliveryAddress}`)
      
      const language = getLanguageForMarket(market)
      const quotationPayload = SDKClient.default.QuotationPayloadBuilder
        .quotationPayload()
        .withLanguage(language)
        .withServiceType(service)
        .withStops([
          {
            coordinates: {
              lat: pickupLat.toString(),
              lng: pickupLng.toString(),
            },
            address: pickupAddress,
          },
          {
            coordinates: {
              lat: deliveryLat.toString(),
              lng: deliveryLng.toString(),
            },
            address: deliveryAddress,
          },
        ])
        .build()

      console.log('📤 Sending quotation request...')
      const quotation = await client.Quotation.create(market, quotationPayload)
      
      console.log('✅ Quotation created successfully!')
      console.log(`   Quotation ID: ${quotation.id}`)
      console.log(`   Price: ${quotation.priceBreakdown.total} ${quotation.priceBreakdown.currency}`)
      console.log(`   Expires: ${quotation.expiresAt}`)
    } catch (error) {
      console.error('❌ Failed to create quotation:', error.message)
      console.error('   Full error:', error)
      process.exit(1)
    }
  } else {
    console.log('\n⚠️  Skipping quotation test - restaurant address not configured')
    console.log('   Add restaurant address, latitude, and longitude in tenant config')
  }

  console.log('\n✅ All tests passed!')
}

testLalamove().catch(error => {
  console.error('\n❌ Unexpected error:', error)
  process.exit(1)
})
