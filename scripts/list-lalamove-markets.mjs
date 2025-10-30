/**
 * List supported Lalamove markets
 */

const markets = [
  'HK', // Hong Kong
  'SG', // Singapore
  'TH', // Thailand
  'PH', // Philippines
  'TW', // Taiwan
  'MY', // Malaysia
  'VN', // Vietnam
  'ID', // Indonesia
  'IN', // India
]

console.log('\n📋 Supported Lalamove Markets:\n')
markets.forEach(market => {
  console.log(`  ${market}`)
})
console.log('\n')

// Read from SDK docs or test
import('@lalamove/lalamove-js').then(sdk => {
  console.log('SDK loaded successfully')
}).catch(err => {
  console.log('SDK error:', err.message)
})
