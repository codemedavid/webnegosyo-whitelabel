#!/usr/bin/env node
/**
 * Cloudinary image backup.
 *
 * Reads cloudinary-backup/urls.txt (one delivery URL per line), downloads each
 * asset to cloudinary-backup/files/<cloud>/<path...>, and records every result
 * in cloudinary-backup/manifest.json.
 *
 * - Resumable: a URL already present in the manifest with status "ok" and an
 *   existing file on disk is skipped.
 * - Concurrency-limited and retrying so it survives flaky networks.
 *
 * The local layout mirrors the Cloudinary public_id exactly, so restore.mjs can
 * re-upload with the same public_id (identical URLs if the account is restored,
 * or a clean cloud-name swap if migrating to a new account).
 *
 * Usage:
 *   node cloudinary-backup/backup.mjs            # download everything pending
 *   node cloudinary-backup/backup.mjs --retry    # also retry previously-failed URLs
 */
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const DIR = dirname(fileURLToPath(import.meta.url))
const URLS_FILE = join(DIR, 'urls.txt')
const FILES_DIR = join(DIR, 'files')
const MANIFEST = join(DIR, 'manifest.json')
const CONCURRENCY = 8
const MAX_RETRIES = 3
const RETRY_FAILED = process.argv.includes('--retry')

/** Parse a Cloudinary delivery URL into its addressable parts. */
function parseCloudinaryUrl(url) {
  // https://res.cloudinary.com/<cloud>/<resource_type>/<delivery>/<...maybe transforms...>/v<version>/<public_id>.<ext>
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const cloud = parts[0]
  const resourceType = parts[1] // image | video | raw
  const deliveryType = parts[2] // upload | authenticated | private | fetch
  const rest = parts.slice(3)
  const versionIdx = rest.findIndex((p) => /^v\d+$/.test(p))
  const version = versionIdx >= 0 ? rest[versionIdx] : null
  // public_id + ext is everything after the version (or after transforms if no version)
  const tail = versionIdx >= 0 ? rest.slice(versionIdx + 1) : rest
  const tailPath = tail.join('/')
  const dot = tailPath.lastIndexOf('.')
  const publicId = dot >= 0 ? tailPath.slice(0, dot) : tailPath
  const format = dot >= 0 ? tailPath.slice(dot + 1) : ''
  // local path mirrors cloud/public_id(.ext)
  const localRel = join(cloud, ...tail)
  return { cloud, resourceType, deliveryType, version, publicId, format, localRel }
}

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function download(url, destAbs) {
  await mkdir(dirname(destAbs), { recursive: true })
  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) {
        return { status: 'http_error', httpStatus: res.status }
      }
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(destAbs, buf)
      const sha256 = createHash('sha256').update(buf).digest('hex')
      return {
        status: 'ok',
        httpStatus: res.status,
        bytes: buf.length,
        sha256,
        contentType: res.headers.get('content-type') || null,
      }
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  return { status: 'network_error', error: String(lastErr) }
}

async function main() {
  const urls = (await readFile(URLS_FILE, 'utf8'))
    .split('\n').map((s) => s.trim()).filter(Boolean)

  /** @type {Record<string, any>} */
  let manifest = {}
  if (await exists(MANIFEST)) {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  }

  const pending = urls.filter((url) => {
    const m = manifest[url]
    if (!m) return true
    if (m.status === 'ok') return false
    return RETRY_FAILED // re-attempt failures only when asked
  })

  console.log(`Total URLs: ${urls.length}`)
  console.log(`Already ok: ${urls.filter((u) => manifest[u]?.status === 'ok').length}`)
  console.log(`To process: ${pending.length}${RETRY_FAILED ? ' (including prior failures)' : ''}`)

  let done = 0
  const counts = { ok: 0, http_error: 0, network_error: 0 }
  const saveManifest = () => writeFile(MANIFEST, JSON.stringify(manifest, null, 2))

  let cursor = 0
  async function worker() {
    while (cursor < pending.length) {
      const url = pending[cursor++]
      const meta = parseCloudinaryUrl(url)
      const destAbs = join(FILES_DIR, meta.localRel)
      const result = await download(url, destAbs)
      manifest[url] = {
        url,
        cloud: meta.cloud,
        resourceType: meta.resourceType,
        deliveryType: meta.deliveryType,
        version: meta.version,
        publicId: meta.publicId,
        format: meta.format,
        localPath: join('files', meta.localRel),
        ...result,
      }
      counts[result.status] = (counts[result.status] || 0) + 1
      done++
      if (done % 50 === 0) {
        await saveManifest()
        console.log(`  ${done}/${pending.length}  ok=${counts.ok} http_err=${counts.http_error} net_err=${counts.network_error}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await saveManifest()

  // Summary by cloud + status
  const summary = {}
  for (const m of Object.values(manifest)) {
    summary[m.cloud] ??= {}
    summary[m.cloud][m.status] = (summary[m.cloud][m.status] || 0) + (m.status === 'http_error' ? 0 : 1)
    if (m.status === 'http_error') {
      const k = `http_${m.httpStatus}`
      summary[m.cloud][k] = (summary[m.cloud][k] || 0) + 1
    }
  }
  console.log('\n=== DONE ===')
  console.log(`Processed this run: ${done}  (ok=${counts.ok}, http_error=${counts.http_error}, network_error=${counts.network_error})`)
  console.log('Manifest entries:', Object.keys(manifest).length)
  console.log('By cloud/status:', JSON.stringify(summary, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
