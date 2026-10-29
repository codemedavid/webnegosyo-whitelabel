#!/usr/bin/env node
/**
 * Copy every backed-up image into Cloudflare R2 (bucket webnegosyo-media,
 * served at https://media.webnegosyo.com). Nothing in the database changes:
 * this only makes an R2 copy of each file so a later relink can point at it.
 *
 *   node image-backup/restore-r2.mjs            # dry run (counts, sample keys)
 *   node image-backup/restore-r2.mjs --go       # upload (resumable)
 *   node image-backup/restore-r2.mjs --verify   # HEAD every copied object, compare size
 *
 * Keys are deterministic — legacy/<provider>/<account>/<original path> — so a
 * rerun or a second machine lands on the same object. Writes carry
 * `If-None-Match: *`: an object that already exists is never replaced (a 412 is
 * then checked by size and counted as done).
 *
 * Writes r2-result.json: canonical URL → { key, url, bytes, sha256 }.
 * Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (.env.local).
 * Plan: docs/plans/2026-10-30-cloudflare-r2-storage-and-email.md (Phase 5).
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AwsClient } from 'aws4fetch'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const MANIFEST = join(DIR, 'manifest.json')
const RESULT = join(DIR, 'r2-result.json')
const MEDIA_BASE = 'https://media.webnegosyo.com'
const CONCURRENCY = 8
const SAVE_EVERY = 200
const GO = process.argv.includes('--go')
const VERIFY = process.argv.includes('--verify')
const IMMUTABLE = 'public, max-age=31536000, immutable'

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

const ACCOUNT = process.env.R2_ACCOUNT_ID
const BUCKET = process.env.R2_BUCKET || 'webnegosyo-media'
if (!ACCOUNT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.')
  process.exit(1)
}

const r2 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
  retries: 4,
})

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/')
const objectUrl = (key) => `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${encodeKey(key)}`

/** Deterministic R2 key for a manifest entry. */
export function keyFor(entry) {
  const path = String(entry.filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
  return `legacy/${entry.provider}/${entry.id}/${path}`
}

const EXT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  if (bytes.slice(0, 3).toString() === 'GIF') return 'image/gif'
  if (bytes.slice(4, 12).toString() === 'ftypavif') return 'image/avif'
  return null
}

/** Never store active content (SVG/HTML) under our domain: octet-stream instead. */
function contentTypeFor(entry, bytes) {
  const sniffed = sniff(bytes)
  if (sniffed) return sniffed
  const declared = String(entry.contentType || '').split(';')[0].trim().toLowerCase()
  if (Object.values(EXT_TYPES).includes(declared)) return declared
  const ext = /\.([a-z0-9]{1,5})$/i.exec(entry.filePath || '')?.[1]?.toLowerCase()
  return EXT_TYPES[ext] || 'application/octet-stream'
}

async function headSize(key) {
  const res = await r2.fetch(objectUrl(key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HEAD ${res.status}`)
  return Number(res.headers.get('content-length'))
}

async function copyOne(entry) {
  const localPath = join(DIR, 'files', entry.localRel)
  if (!existsSync(localPath)) return { status: 'missing_local' }
  const bytes = await readFile(localPath)
  const key = keyFor(entry)
  const res = await r2.fetch(objectUrl(key), {
    method: 'PUT',
    body: bytes,
    headers: {
      'content-type': contentTypeFor(entry, bytes),
      'cache-control': IMMUTABLE,
      'if-none-match': '*',
    },
  })
  if (res.status === 412) {
    const size = await headSize(key)
    return size === bytes.length
      ? { status: 'ok', key, bytes: bytes.length, note: 'already_present' }
      : { status: 'conflict', key, bytes: bytes.length, remoteBytes: size }
  }
  if (!res.ok) return { status: 'error', key, httpStatus: res.status, detail: (await res.text()).slice(0, 200) }
  return { status: 'ok', key, bytes: bytes.length }
}

async function pool(items, worker) {
  let next = 0
  let done = 0
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
      done += 1
      if (done % 100 === 0) console.log(`  ${done}/${items.length}`)
    }
  })
  await Promise.all(runners)
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const entries = Object.values(manifest.entries || manifest).filter((e) => e.status === 'ok' && e.localRel)
  const result = existsSync(RESULT) ? JSON.parse(await readFile(RESULT, 'utf8')) : {}

  if (VERIFY) {
    const copied = Object.entries(result).filter(([, r]) => r.status === 'ok')
    let good = 0
    const bad = []
    await pool(copied, async ([canonical, r]) => {
      try {
        const size = await headSize(r.key)
        if (size === r.bytes) good += 1
        else bad.push({ canonical, key: r.key, expected: r.bytes, got: size })
      } catch (error) {
        bad.push({ canonical, key: r.key, error: String(error) })
      }
    })
    console.log(`verified ${good}/${copied.length}; mismatches: ${bad.length}`)
    if (bad.length) await writeFile(join(DIR, 'r2-verify-failures.json'), JSON.stringify(bad, null, 2))
    process.exit(bad.length ? 1 : 0)
  }

  const pending = entries.filter((e) => result[e.canonical]?.status !== 'ok')
  console.log(`manifest ok entries: ${entries.length}; already copied: ${entries.length - pending.length}; pending: ${pending.length}`)
  console.log('sample keys:', pending.slice(0, 3).map(keyFor))
  if (!GO) {
    console.log('Dry run. Re-run with --go to upload.')
    return
  }

  let sinceSave = 0
  const save = () => writeFile(RESULT, JSON.stringify(result, null, 1))
  await pool(pending, async (entry) => {
    try {
      const outcome = await copyOne(entry)
      result[entry.canonical] = {
        ...outcome,
        url: outcome.key ? `${MEDIA_BASE}/${encodeKey(outcome.key)}` : undefined,
        sha256: entry.sha256 ?? null,
        localBytes: (await stat(join(DIR, 'files', entry.localRel)).catch(() => null))?.size ?? null,
      }
    } catch (error) {
      result[entry.canonical] = { status: 'error', detail: String(error).slice(0, 200) }
    }
    sinceSave += 1
    if (sinceSave >= SAVE_EVERY) {
      sinceSave = 0
      await save()
    }
  })
  await save()

  const counts = {}
  for (const r of Object.values(result)) counts[r.status] = (counts[r.status] || 0) + 1
  console.log('done:', counts)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
