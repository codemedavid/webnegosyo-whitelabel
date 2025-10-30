/**
 * Test Mapbox search for specific places
 */

import { readFileSync } from 'fs'

// Load environment variables
let mapboxToken
try {
  const envContent = readFileSync('.env.local', 'utf-8')
  const envLines = envContent.split('\n')
  for (const line of envLines) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (key === 'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN') mapboxToken = value
    }
  }
} catch (error) {
  console.error('Failed to read .env.local:', error.message)
  process.exit(1)
}

if (!mapboxToken) {
  console.error('❌ Missing MAPBOX_ACCESS_TOKEN')
  process.exit(1)
}

async function testSearch(query) {
  console.log(`\n🔍 Searching for: "${query}"\n`)
  
  try {
    // Try with broad types
    let response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=PH&limit=10&types=address,poi,place,neighborhood,locality`
    )
    let data = await response.json()
    
    if (!data.features || data.features.length === 0) {
      console.log('No results with types filter. Trying without filter...')
      response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=PH&limit=10`
      )
      data = await response.json()
    }
    
    if (data.features && data.features.length > 0) {
      console.log(`✅ Found ${data.features.length} results:\n`)
      data.features.forEach((feature, idx) => {
        console.log(`${idx + 1}. ${feature.place_name}`)
        console.log(`   Type: ${feature.place_type.join(', ')}`)
        console.log(`   Location: ${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]}`)
        console.log('')
      })
    } else {
      console.log('❌ No results found')
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Test searches
const testQueries = process.argv.slice(2)
if (testQueries.length === 0) {
  console.log('Usage: node scripts/test-mapbox-search.mjs "search term"')
  console.log('\nExample:')
  console.log('  node scripts/test-mapbox-search.mjs "SM Lucena"')
  console.log('  node scripts/test-mapbox-search.mjs "Ayala Alabang"')
} else {
  for (const query of testQueries) {
    await testSearch(query)
  }
}
