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
    const proximityCenter = '120.9842,14.5995' // Manila coordinates
    
    // Try multiple search strategies (same as the component)
    const searchStrategies = [
      {
        name: 'POI-focused with proximity',
        url: `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=PH&types=poi&proximity=${proximityCenter}&limit=5`
      },
      {
        name: 'Broader search (POI, place, address)',
        url: `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=PH&types=poi,place,address,locality&proximity=${proximityCenter}&limit=5`
      },
      {
        name: 'Fuzzy matching',
        url: `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=PH&fuzzyMatch=true&proximity=${proximityCenter}&limit=5`
      }
    ]
    
    const allFeatures = []
    const seenPlaces = new Set()
    
    for (const strategy of searchStrategies) {
      console.log(`\n📍 Strategy: ${strategy.name}`)
      const response = await fetch(strategy.url)
      const data = await response.json()
      
      if (data.features && data.features.length > 0) {
        console.log(`   Found ${data.features.length} results`)
        for (const feature of data.features) {
          const coordKey = `${feature.geometry.coordinates[0].toFixed(4)},${feature.geometry.coordinates[1].toFixed(4)}`
          if (!seenPlaces.has(coordKey)) {
            seenPlaces.add(coordKey)
            allFeatures.push(feature)
          }
        }
      } else {
        console.log('   No results')
      }
    }
    
    if (allFeatures.length > 0) {
      console.log(`\n✅ Total unique results: ${allFeatures.length}\n`)
      allFeatures.forEach((feature, idx) => {
        console.log(`${idx + 1}. ${feature.place_name}`)
        console.log(`   Type: ${feature.place_type.join(', ')}`)
        console.log(`   Location: ${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]}`)
        console.log('')
      })
    } else {
      console.log('\n❌ No results found')
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
