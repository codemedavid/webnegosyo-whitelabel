#!/usr/bin/env node
/**
 * Extract every image URL referenced in Supabase, plus every file currently
 * in the ImageKit media library. Writes image-backup/urls.json.
 *
 *   node image-backup/extract.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const OUT = join(DIR, 'urls.json')

function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx)
    let value = trimmed.slice(idx + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv()

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const URL_RE = /https?:\/\/[^\s"'\\)\]},]+/gi
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|svg|avif|bmp|heic|heif)(\?|$)/i
const SKIP_HOSTS = new Set(['via.placeholder.com', 'placeholder.com', 'placehold.co'])

const SOURCES = [
  { table: 'menu_items', text: ['image_url'], json: ['addons', 'variation_types', 'variations', 'modifier_groups'] },
  { table: 'bundles', text: ['image_url'], json: [] },
  { table: 'categories', text: ['icon'], json: ['default_addons'] },
  { table: 'addon_library', text: ['image_url'], json: [] },
  { table: 'inventory_items', text: ['image_url'], json: [] },
  { table: 'outlets', text: ['image_url'], json: [] },
  {
    table: 'tenants',
    text: [
      'logo_url',
      'flash_screen_image_url',
      'promotion_image_url',
      'background_image_url',
      'hero_image_url',
      'footer_logo_url',
    ],
    json: ['promotion_banners', 'welcome_page_banners'],
  },
  { table: 'payment_methods', text: ['qr_code_url'], json: [] },
  { table: 'platform_payment_methods', text: ['qr_code_url'], json: [] },
  { table: 'orders', text: ['payment_method_qr_code_url', 'payment_proof_url'], json: [] },
  { table: 'checkout_leads', text: ['payment_proof_url'], json: [] },
  { table: 'order_payments', text: ['proof_url'], json: [] },
  { table: 'platform_announcements', text: ['cover_image_url'], json: ['blocks'] },
]

function cleanUrl(raw) {
  let url = String(raw).trim().replace(/[.,;]+$/, '')
  try { url = decodeURIComponent(url) } catch { /* keep original */ }
  return url
}

function isImageUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (SKIP_HOSTS.has(host)) return false
    if (host.includes('imagekit.io') || host.includes('cloudinary.com')) return true
    if (host.includes('loyverse.com')) return true
    if (host.includes('supabase.co') && url.includes('/storage/')) return true
    return IMAGE_EXT_RE.test(url)
  } catch {
    return false
  }
}

function parseImageKit(url) {
  const u = new URL(url)
  const segments = u.pathname.split('/').filter(Boolean)
  const id = segments[0] || 'unknown'
  const filePath = segments.slice(1).filter((s) => !s.startsWith('tr:')).join('/')
  const canonical = `https://ik.imagekit.io/${id}/${filePath}`
  return { provider: 'imagekit', id, filePath, canonical, localRel: join('imagekit', id, ...filePath.split('/')) }
}

function parseCloudinary(url) {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const cloud = parts[0]
  const rest = parts.slice(3)
  const versionIdx = rest.findIndex((p) => /^v\d+$/.test(p))
  const tail = versionIdx >= 0 ? rest.slice(versionIdx + 1) : rest.filter((p) => !/^[a-z]+_/.test(p))
  const tailPath = tail.join('/')
  const dot = tailPath.lastIndexOf('.')
  const publicId = dot >= 0 ? tailPath.slice(0, dot) : tailPath
  const format = dot >= 0 ? tailPath.slice(dot + 1) : ''
  const fileName = format ? `${publicId}.${format}` : publicId
  return {
    provider: 'cloudinary',
    id: cloud,
    filePath: fileName,
    canonical: url.split('?')[0],
    localRel: join('cloudinary', cloud, ...fileName.split('/')),
  }
}

function parseOther(url) {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname.replace(/^\//, '') || 'index'
  const safe = path.replace(/[^a-zA-Z0-9._/-]+/g, '_')
  return {
    provider: host.includes('loyverse') ? 'loyverse' : 'other',
    id: host,
    filePath: safe,
    canonical: url.split('?')[0],
    localRel: join('other', host, ...safe.split('/')),
  }
}

function classify(url) {
  if (url.includes('ik.imagekit.io')) return parseImageKit(url)
  if (url.includes('res.cloudinary.com')) return parseCloudinary(url)
  return parseOther(url)
}

function collectFromText(text, into, source) {
  if (!text || typeof text !== 'string') return
  for (const match of text.matchAll(URL_RE)) {
    const url = cleanUrl(match[0])
    if (!isImageUrl(url)) continue
    const existing = into.get(url) || { url, sources: new Set() }
    existing.sources.add(source)
    into.set(url, existing)
  }
}

async function fetchTable(table, columns) {
  const rows = []
  const page = 1000
  let from = 0
  for (;;) {
    const select = columns.join(',')
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + page - 1}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${table} ${res.status}: ${body.slice(0, 300)}`)
    }
    const chunk = await res.json()
    rows.push(...chunk)
    if (chunk.length < page) break
    from += page
  }
  return rows
}

async function listImageKit() {
  if (!IMAGEKIT_PRIVATE_KEY) {
    console.warn('No IMAGEKIT_PRIVATE_KEY — skipping ImageKit media library listing')
    return []
  }
  const auth = 'Basic ' + Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64')
  const files = []
  let skip = 0
  const limit = 1000
  for (;;) {
    const res = await fetch(`https://api.imagekit.io/v1/files?limit=${limit}&skip=${skip}`, {
      headers: { Authorization: auth },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`ImageKit list ${res.status}: ${body.slice(0, 300)}`)
    }
    const chunk = await res.json()
    if (!Array.isArray(chunk) || chunk.length === 0) break
    files.push(...chunk)
    if (chunk.length < limit) break
    skip += limit
  }
  return files
}

async function main() {
  const found = new Map()

  for (const src of SOURCES) {
    const columns = [...src.text, ...src.json]
    process.stdout.write(`Fetching ${src.table} (${columns.join(', ')})… `)
    const rows = await fetchTable(src.table, columns)
    console.log(`${rows.length} rows`)
    for (const row of rows) {
      for (const col of src.text) {
        collectFromText(row[col], found, `${src.table}.${col}`)
      }
      for (const col of src.json) {
        const val = row[col]
        if (val == null) continue
        collectFromText(typeof val === 'string' ? val : JSON.stringify(val), found, `${src.table}.${col}`)
      }
    }
  }

  console.log(`Distinct DB URLs: ${found.size}`)

  let imagekitLibrary = []
  try {
    imagekitLibrary = await listImageKit()
    console.log(`ImageKit library files: ${imagekitLibrary.length}`)
  } catch (err) {
    console.warn(`ImageKit list failed: ${err.message}`)
  }

  for (const file of imagekitLibrary) {
    if (!file.url) continue
    const existing = found.get(file.url) || { url: file.url, sources: new Set() }
    existing.sources.add('imagekit.library')
    existing.imagekit = {
      fileId: file.fileId,
      filePath: file.filePath,
      size: file.size,
      fileType: file.fileType,
      name: file.name,
    }
    found.set(file.url, existing)
  }

  const entries = []
  const byProvider = {}
  const bySource = {}
  let skipped = 0

  for (const item of found.values()) {
    let meta
    try {
      meta = classify(item.url)
    } catch {
      skipped++
      continue
    }
    for (const s of item.sources) bySource[s] = (bySource[s] || 0) + 1
    byProvider[meta.provider] = (byProvider[meta.provider] || 0) + 1
    entries.push({
      url: item.url,
      canonical: meta.canonical,
      provider: meta.provider,
      id: meta.id,
      filePath: meta.filePath,
      localRel: meta.localRel.replaceAll('\\', '/'),
      sources: [...item.sources].sort(),
      imagekit: item.imagekit || null,
    })
  }

  // Deduplicate by canonical URL so transforms of the same asset download once.
  const canonical = new Map()
  for (const e of entries) {
    const prev = canonical.get(e.canonical)
    if (!prev) {
      canonical.set(e.canonical, { ...e, aliases: e.url === e.canonical ? [] : [e.url] })
      continue
    }
    prev.sources = [...new Set([...prev.sources, ...e.sources])].sort()
    if (e.url !== e.canonical && !prev.aliases.includes(e.url)) prev.aliases.push(e.url)
    if (!prev.imagekit && e.imagekit) prev.imagekit = e.imagekit
  }

  const unique = [...canonical.values()].sort((a, b) => a.canonical.localeCompare(b.canonical))
  const libraryBytes = imagekitLibrary.reduce((sum, f) => sum + (f.size || 0), 0)

  const payload = {
    extractedAt: new Date().toISOString(),
    dbUrlCount: found.size,
    uniqueCanonicalCount: unique.length,
    skipped,
    imagekitLibraryCount: imagekitLibrary.length,
    imagekitLibraryBytes: libraryBytes,
    byProvider,
    bySource,
    urls: unique,
  }

  await writeFile(OUT, JSON.stringify(payload, null, 2))
  console.log('\n=== EXTRACT DONE ===')
  console.log(`Wrote ${OUT}`)
  console.log(`Unique canonical URLs: ${unique.length}`)
  console.log('By provider:', byProvider)
  console.log(`ImageKit library size: ${(libraryBytes / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
