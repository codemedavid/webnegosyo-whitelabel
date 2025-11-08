/**
 * Quick test to verify Nominatim can find Philippine POIs
 */

async function testNominatim(query) {
  console.log(`\n🔍 Testing Nominatim for: "${query}"\n`)
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query)}&` +
      `countrycodes=ph&` +
      `format=json&` +
      `limit=5&` +
      `addressdetails=1`,
      {
        headers: {
          'User-Agent': 'WhitelabelDeliveryApp/1.0'
        }
      }
    )
    
    const data = await response.json()
    
    if (Array.isArray(data) && data.length > 0) {
      console.log(`✅ Found ${data.length} results:\n`)
      data.forEach((place, idx) => {
        console.log(`${idx + 1}. ${place.name || 'Unnamed'}`)
        console.log(`   ${place.display_name}`)
        console.log(`   Type: ${place.type} (${place.class})`)
        console.log(`   Coordinates: ${place.lat}, ${place.lon}`)
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
const queries = process.argv.slice(2)
if (queries.length === 0) {
  console.log('Usage: node scripts/test-nominatim.mjs "search term"')
  console.log('\nTesting default queries...\n')
  await testNominatim('jollibee molino')
  await testNominatim('puregold magdiwang')
} else {
  for (const query of queries) {
    await testNominatim(query)
  }
}

