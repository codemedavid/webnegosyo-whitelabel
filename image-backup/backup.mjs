#!/usr/bin/env node
/**
 * Download every canonical image URL from urls.json into image-backup/files/.
 *
 * Resumable: entries already "ok" in manifest.json with a file on disk are skipped.
 * Reuses matching files from cloudinary-backup/files via hardlink when possible.
 * Stops if free disk space drops below 1.5 GB.
 *
 *   node image-backup/backup.mjs
 *   node image-backup/backup.mjs --retry
 */
import { copyFile, link } from 'node:fs/promises'
import { mkdir, readFile, writeFile, stat, statfs } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const URLS_FILE = join(DIR, 'urls.json')
const FILES_DIR = join(DIR, 'files')
const MANIFEST = join(DIR, 'manifest.json')
const CLOUDINARY_FILES = join(ROOT, 'cloudinary-backup', 'files')
const CONCURRENCY = 8
const MAX_RETRIES = 3
const MIN_FREE_BYTES = 1.5 * 1024 * 1024 * 1024
const RETRY_FAILED = process.argv.includes('--retry')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function freeBytes(dir) {
  await mkdir(dir, { recursive: true })
  const s = await statfs(dir)
  return Number(s.bavail) * Number(s.bsize)
}

function indexCloudinaryFiles() {
  const index = new Map()
  if (!existsSync(CLOUDINARY_FILES)) return index
  const clouds = readdirSync(CLOUDINARY_FILES, { withFileTypes: true })
  for (const cloud of clouds) {
    if (!cloud.isDirectory()) continue
    const root = join(CLOUDINARY_FILES, cloud.name)
    const stack = [root]
    while (stack.length) {
      const current = stack.pop()
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const abs = join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(abs)
          continue
        }
        const rel = abs.slice(root.length + 1).replaceAll('\\', '/')
        if (!index.has(rel)) index.set(rel, abs)
      }
    }
  }
  return index
}

async function sha256File(abs) {
  const buf = await readFile(abs)
  return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }
}

async function fetchToFile(url, destAbs, origin) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    return {
      status: 'http_error',
      httpStatus: res.status,
      ikError: res.headers.get('ik-error'),
    }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) return { status: 'empty', httpStatus: res.status, bytes: 0 }
  await writeFile(destAbs, buf)
  return {
    status: 'ok',
    httpStatus: res.status,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    contentType: res.headers.get('content-type') || null,
    origin,
  }
}

async function download(url, destAbs) {
  await mkdir(dirname(destAbs), { recursive: true })
  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchToFile(url, destAbs, 'download')
      if (result.status === 'http_error' && result.httpStatus === 400) {
        // ImageKit refuses originals over 25 MP on the delivery URL. Keep a
        // 4096px-capped copy so the asset is still restorable.
        const resized = url.includes('?') ? `${url}&tr=w-4096,h-4096,c-at_max` : `${url}?tr=w-4096,h-4096,c-at_max`
        return fetchToFile(resized, destAbs, 'download_resized_under_25mp')
      }
      return result
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  return { status: 'network_error', error: String(lastErr) }
}

async function reuseOrDownload(entry, destAbs, cloudinaryIndex) {
  if (await exists(destAbs)) {
    const hash = await sha256File(destAbs)
    return { status: 'ok', ...hash, origin: 'already_on_disk', httpStatus: 200, contentType: null }
  }

  const reuseAbs = cloudinaryIndex.get(entry.filePath)
  if (reuseAbs && await exists(reuseAbs)) {
    await mkdir(dirname(destAbs), { recursive: true })
    try {
      await link(reuseAbs, destAbs)
    } catch {
      await copyFile(reuseAbs, destAbs)
    }
    const hash = await sha256File(destAbs)
    return { status: 'ok', ...hash, origin: 'cloudinary_backup', httpStatus: 200, contentType: null }
  }

  return download(entry.canonical, destAbs)
}

async function main() {
  if (!(await exists(URLS_FILE))) {
    console.error('Run node image-backup/extract.mjs first')
    process.exit(1)
  }

  const extracted = JSON.parse(await readFile(URLS_FILE, 'utf8'))
  const urls = extracted.urls || []
  let manifest = {}
  if (await exists(MANIFEST)) manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))

  const pending = urls.filter((entry) => {
    const m = manifest[entry.canonical]
    if (!m) return true
    if (m.status === 'ok') return false
    return RETRY_FAILED
  })

  const cloudinaryIndex = indexCloudinaryFiles()
  const free = await freeBytes(FILES_DIR)

  console.log(`Unique URLs: ${urls.length}`)
  console.log(`Already ok:  ${urls.length - pending.length}`)
  console.log(`To process:  ${pending.length}`)
  console.log(`Reusable Cloudinary files: ${cloudinaryIndex.size}`)
  console.log(`Free disk:   ${(free / 1024 / 1024 / 1024).toFixed(2)} GB`)

  if (free < MIN_FREE_BYTES) {
    console.error('Not enough free disk (need 1.5 GB spare). Free space and re-run.')
    process.exit(1)
  }

  let done = 0
  const counts = { ok: 0, http_error: 0, network_error: 0, empty: 0, disk_full: 0 }
  let stop = false
  const saveManifest = () => writeFile(MANIFEST, JSON.stringify(manifest, null, 2))

  let cursor = 0
  async function worker() {
    while (cursor < pending.length && !stop) {
      const entry = pending[cursor++]
      const destAbs = join(FILES_DIR, entry.localRel)
      const remaining = await freeBytes(FILES_DIR)
      if (remaining < MIN_FREE_BYTES) {
        stop = true
        manifest[entry.canonical] = { ...entry, status: 'disk_full' }
        counts.disk_full++
        return
      }
      const result = await reuseOrDownload(entry, destAbs, cloudinaryIndex)
      manifest[entry.canonical] = { ...entry, ...result }
      counts[result.status] = (counts[result.status] || 0) + 1
      done++
      if (done % 50 === 0) {
        await saveManifest()
        console.log(`  ${done}/${pending.length}  ok=${counts.ok} http_err=${counts.http_error} net_err=${counts.network_error} empty=${counts.empty}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await saveManifest()

  const okEntries = Object.values(manifest).filter((m) => m.status === 'ok')
  const bytes = okEntries.reduce((sum, m) => sum + (m.bytes || 0), 0)
  const byProvider = {}
  for (const m of Object.values(manifest)) {
    byProvider[m.provider] ??= {}
    byProvider[m.provider][m.status] = (byProvider[m.provider][m.status] || 0) + 1
  }

  console.log('\n=== DONE ===')
  console.log(`Processed this run: ${done}  (ok=${counts.ok}, http_error=${counts.http_error}, network_error=${counts.network_error}, empty=${counts.empty}, disk_full=${counts.disk_full})`)
  console.log(`Manifest ok: ${okEntries.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  console.log('By provider/status:', JSON.stringify(byProvider, null, 2))
  if (stop) {
    console.error('Stopped early: less than 1.5 GB free. Free disk and re-run to finish.')
    process.exit(2)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
