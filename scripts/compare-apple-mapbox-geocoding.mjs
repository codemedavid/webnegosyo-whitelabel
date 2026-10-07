/**
 * Apple Maps vs Mapbox: how close does each provider land to where real
 * customers actually pinned their delivery address?
 *
 * Ground truth = recent platform orders whose customer_data carries both a
 * delivery_address and the delivery_lat/lng the customer confirmed at checkout.
 * Each address is forward-geocoded by Apple (Maps Server API) and by Mapbox
 * (Search Box suggest + retrieve, what checkout uses), and the distance to the
 * customer's pin is measured.
 *
 * PRIVACY: prints aggregates only — never an address, name or coordinate.
 *
 * Usage: node scripts/compare-apple-mapbox-geocoding.mjs [sampleSize=150]
 * Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN, APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID,
 * APPLE_MAPKIT_PRIVATE_KEY (or APPLE_MAPKIT_PRIVATE_KEY_PATH to the .p8).
 */

import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local', quiet: true })

const SAMPLE_SIZE = Number(process.argv[2] ?? 150)
const FETCH_PAGE = 1000
const CONCURRENCY = 4
const THRESHOLDS_M = [100, 250, 500, 1000, 5000]

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name} in .env.local`)
    process.exit(1)
  }
  return value
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const MAPBOX_TOKEN = requireEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN')
const TEAM_ID = requireEnv('APPLE_MAPKIT_TEAM_ID')
const KEY_ID = requireEnv('APPLE_MAPKIT_KEY_ID')
const PRIVATE_KEY = process.env.APPLE_MAPKIT_PRIVATE_KEY_PATH
  ? readFileSync(process.env.APPLE_MAPKIT_PRIVATE_KEY_PATH, 'utf8')
  : requireEnv('APPLE_MAPKIT_PRIVATE_KEY').replace(/\\n/g, '\n')

function haversineMeters(a, b) {
  const R = 6_371_000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function loadSamples() {
  const rows = []
  for (let offset = 0; rows.length < SAMPLE_SIZE * 3; offset += FETCH_PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/orders?select=customer_data&customer_data->>delivery_lat=not.is.null&order=created_at.desc&limit=${FETCH_PAGE}&offset=${offset}`
    const response = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
    if (!response.ok) throw new Error(`orders read failed: ${response.status}`)
    const page = await response.json()
    rows.push(...page)
    if (page.length < FETCH_PAGE) break
  }

  const seen = new Set()
  const samples = []
  for (const { customer_data: data } of rows) {
    const address = typeof data?.delivery_address === 'string' ? data.delivery_address.trim() : ''
    const lat = Number(data?.delivery_lat)
    const lng = Number(data?.delivery_lng)
    if (!address || address.startsWith('Lat:') || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (seen.has(address.toLowerCase())) continue
    seen.add(address.toLowerCase())
    samples.push({ address, pin: { lat, lng } })
    if (samples.length >= SAMPLE_SIZE) break
  }
  return samples
}

let appleAccessToken = null
async function appleToken() {
  if (appleAccessToken) return appleAccessToken
  const now = Math.floor(Date.now() / 1000)
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${enc({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${enc({ iss: TEAM_ID, iat: now, exp: now + 600 })}`
  const signature = sign('sha256', Buffer.from(input), { key: createPrivateKey(PRIVATE_KEY), dsaEncoding: 'ieee-p1363' })
  const response = await fetch('https://maps-api.apple.com/v1/token', {
    headers: { Authorization: `Bearer ${input}.${signature.toString('base64url')}` },
  })
  if (!response.ok) throw new Error(`Apple token exchange failed: ${response.status} ${await response.text()}`)
  appleAccessToken = (await response.json()).accessToken
  return appleAccessToken
}

async function appleGeocode(address, near) {
  const params = new URLSearchParams({
    q: address,
    limitToCountries: 'PH',
    lang: 'en-US',
    resultTypeFilter: 'Address,Poi',
    searchLocation: `${near.lat},${near.lng}`,
  })
  const response = await fetch(`https://maps-api.apple.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${await appleToken()}` },
  })
  if (!response.ok) throw new Error(`Apple search ${response.status}`)
  const first = (await response.json()).results?.[0]
  return first?.coordinate ? { lat: first.coordinate.latitude, lng: first.coordinate.longitude } : null
}

async function mapboxGeocode(address, near) {
  const session = randomUUID()
  const suggestParams = new URLSearchParams({
    q: address,
    access_token: MAPBOX_TOKEN,
    session_token: session,
    country: 'ph',
    language: 'en',
    limit: '1',
    proximity: `${near.lng},${near.lat}`,
  })
  const suggest = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${suggestParams}`)
  if (!suggest.ok) throw new Error(`Mapbox suggest ${suggest.status}`)
  const id = (await suggest.json()).suggestions?.[0]?.mapbox_id
  if (!id) return null
  const retrieve = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}?${new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: session })}`,
  )
  if (!retrieve.ok) throw new Error(`Mapbox retrieve ${retrieve.status}`)
  const coords = (await retrieve.json()).features?.[0]?.geometry?.coordinates
  return Array.isArray(coords) ? { lat: coords[1], lng: coords[0] } : null
}

/** The bias point both providers get: the order's own city-scale area, not its pin. */
function coarse(pin) {
  return { lat: Math.round(pin.lat * 10) / 10, lng: Math.round(pin.lng * 10) / 10 }
}

async function measure(sample) {
  const near = coarse(sample.pin)
  const [apple, mapbox] = await Promise.allSettled([appleGeocode(sample.address, near), mapboxGeocode(sample.address, near)])
  const distance = (result) =>
    result.status === 'rejected' ? { error: true } : result.value ? { meters: haversineMeters(result.value, sample.pin) } : { none: true }
  return { apple: distance(apple), mapbox: distance(mapbox) }
}

function summarize(label, results) {
  const meters = results.filter((r) => r.meters !== undefined).map((r) => r.meters).sort((a, b) => a - b)
  const pct = (n) => `${((n / results.length) * 100).toFixed(0)}%`
  const median = meters.length ? Math.round(meters[Math.floor(meters.length / 2)]) : null
  const within = THRESHOLDS_M.map((t) => `≤${t >= 1000 ? `${t / 1000}km` : `${t}m`}: ${pct(meters.filter((m) => m <= t).length)}`)
  console.log(
    `${label.padEnd(7)} found ${pct(meters.length)} | no result ${pct(results.filter((r) => r.none).length)} | errors ${pct(results.filter((r) => r.error).length)} | median ${median ?? '—'}m | ${within.join('  ')}`,
  )
}

const samples = await loadSamples()
console.log(`Comparing ${samples.length} distinct customer delivery addresses (aggregates only)…\n`)
const measured = []
for (let i = 0; i < samples.length; i += CONCURRENCY) {
  measured.push(...(await Promise.all(samples.slice(i, i + CONCURRENCY).map(measure))))
}
summarize('Apple', measured.map((m) => m.apple))
summarize('Mapbox', measured.map((m) => m.mapbox))
const appleCloser = measured.filter((m) => m.apple.meters !== undefined && (m.mapbox.meters === undefined || m.apple.meters < m.mapbox.meters)).length
console.log(`\nApple closer to the customer's pin on ${appleCloser}/${measured.length} addresses.`)
console.log('Caveat: the customer pin came from Mapbox at checkout, which slightly favours Mapbox.')
