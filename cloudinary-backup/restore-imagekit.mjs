#!/usr/bin/env node
/**
 * Restore the locally backed-up Cloudinary images into ImageKit.
 *
 * Reads manifest.json (produced by backup.mjs), uploads every successfully
 * backed-up file (status === 'ok') to ImageKit, PRESERVING the original public_id
 * as the file path (folder + name, useUniqueFileName=false). Preserving the path
 * makes the new delivery URL deterministic:
 *
 *   cloudinary: https://res.cloudinary.com/<cloud>/image/upload/v<n>/<publicId>.<ext>
 *   imagekit:   <URL_ENDPOINT>/<publicId>.<ext>
 *
 * ...which lets relink-db-imagekit.mjs rewrite the database with a single regex.
 *
 * Resumable: already-uploaded URLs (recorded in restore-result.json) are skipped.
 * Idempotent on ImageKit: overwriteFile=true replaces an existing path in place.
 *
 *   node cloudinary-backup/restore-imagekit.mjs
 *
 * Requires IMAGEKIT_PRIVATE_KEY and NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT (read from
 * the environment or .env.local).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const MANIFEST = join(DIR, 'manifest.json')
const RESULT = join(DIR, 'restore-result.json')
const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload'
const CONCURRENCY = 5

// ── Load env (.env.local), mimicking Next.js, without extra deps ────────────
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv()

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY
const URL_ENDPOINT = (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '').replace(/\/$/, '')

if (!PRIVATE_KEY || !URL_ENDPOINT) {
  console.error('Missing IMAGEKIT_PRIVATE_KEY or NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT.')
  process.exit(1)
}

const AUTH = 'Basic ' + Buffer.from(`${PRIVATE_KEY}:`).toString('base64')

/** Deterministic ImageKit URL for a given public_id + extension. */
function expectedUrl(publicId, format) {
  return `${URL_ENDPOINT}/${publicId}.${format}`
}

async function uploadOne(entry) {
  const localPath = join(DIR, entry.localPath)
  if (!existsSync(localPath)) {
    return { status: 'missing_local' }
  }

  const buf = await readFile(localPath)
  const folder = dirname(entry.publicId) // e.g. "menu-items"
  const fileName = `${basename(entry.publicId)}.${entry.format}` // e.g. "abc.jpg"

  const form = new FormData()
  form.append('file', new Blob([buf], { type: entry.contentType || 'application/octet-stream' }), fileName)
  form.append('fileName', fileName)
  form.append('folder', folder === '.' ? '/' : `/${folder}`)
  form.append('useUniqueFileName', 'false')
  form.append('overwriteFile', 'true')

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: AUTH },
    body: form,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.url || !json.fileId) {
    return { status: 'error', httpStatus: res.status, message: json.message }
  }

  const expected = expectedUrl(entry.publicId, entry.format)
  return {
    status: 'ok',
    url: json.url,
    fileId: json.fileId,
    filePath: json.filePath,
    expected,
    matches: json.url === expected,
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const entries = Object.values(manifest).filter((e) => e.status === 'ok')

  const result = existsSync(RESULT) ? JSON.parse(await readFile(RESULT, 'utf8')) : {}
  const todo = entries.filter((e) => !result[e.url] || result[e.url].status !== 'ok')

  console.log(`Manifest ok entries: ${entries.length}`)
  console.log(`Already restored:     ${entries.length - todo.length}`)
  console.log(`To upload:            ${todo.length}\n`)

  let done = 0
  let failed = 0
  let mismatched = 0

  // Simple fixed-size worker pool.
  let cursor = 0
  async function worker() {
    while (cursor < todo.length) {
      const entry = todo[cursor++]
      try {
        const r = await uploadOne(entry)
        result[entry.url] = r
        if (r.status === 'ok') {
          done++
          if (!r.matches) mismatched++
        } else {
          failed++
          console.warn(`  ✗ ${entry.publicId}: ${r.status} ${r.message || ''}`)
        }
      } catch (err) {
        failed++
        result[entry.url] = { status: 'error', message: String(err) }
        console.warn(`  ✗ ${entry.publicId}: ${err}`)
      }
      if ((done + failed) % 50 === 0) {
        await writeFile(RESULT, JSON.stringify(result, null, 2))
        console.log(`  …${done + failed}/${todo.length} (ok=${done} fail=${failed})`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await writeFile(RESULT, JSON.stringify(result, null, 2))

  console.log(`\nDone. uploaded=${done} failed=${failed} url-mismatches=${mismatched}`)
  if (mismatched > 0) {
    console.log('Some uploads did not land at the deterministic URL; relink will emit')
    console.log('per-asset overrides for those. Review restore-result.json.')
  }
  console.log(`Wrote ${RESULT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
