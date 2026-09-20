#!/usr/bin/env node
/**
 * Re-upload backed-up files to ImageKit, preserving the original file path
 * whenever the source was already ImageKit. Writes restore-result.json
 * (old canonical URL → new ImageKit URL) so the database can be relinked.
 *
 *   node image-backup/restore.mjs           # dry run
 *   node image-backup/restore.mjs --go      # actually upload
 *
 * Requires IMAGEKIT_PRIVATE_KEY and NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT.
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const MANIFEST = join(DIR, 'manifest.json')
const RESULT = join(DIR, 'restore-result.json')
const UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload'
const CONCURRENCY = 5
const GO = process.argv.includes('--go')

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

const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY
const URL_ENDPOINT = (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '').replace(/\/$/, '')

if (!PRIVATE_KEY || !URL_ENDPOINT) {
  console.error('Missing IMAGEKIT_PRIVATE_KEY or NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT.')
  process.exit(1)
}

const AUTH = 'Basic ' + Buffer.from(`${PRIVATE_KEY}:`).toString('base64')

function targetPath(entry) {
  if (entry.provider === 'imagekit' && entry.filePath) return entry.filePath.replace(/^\//, '')
  return `${entry.provider}/${entry.id}/${entry.filePath}`.replace(/\\/g, '/')
}

async function uploadOne(entry) {
  const localPath = join(DIR, 'files', entry.localRel)
  if (!existsSync(localPath)) return { status: 'missing_local' }

  const buf = await readFile(localPath)
  const dest = targetPath(entry)
  const folder = dirname(dest)
  const fileName = basename(dest)

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
  if (!res.ok || !json.url) {
    return { status: 'error', httpStatus: res.status, message: json.message }
  }
  return {
    status: 'ok',
    url: json.url,
    fileId: json.fileId,
    filePath: json.filePath,
    expected: `${URL_ENDPOINT}/${dest}`,
  }
}

async function main() {
  if (!existsSync(MANIFEST)) {
    console.error('No manifest.json — run extract + backup first')
    process.exit(1)
  }
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const entries = Object.values(manifest).filter((e) => e.status === 'ok')
  const result = existsSync(RESULT) ? JSON.parse(await readFile(RESULT, 'utf8')) : {}
  const todo = entries.filter((e) => !result[e.canonical] || result[e.canonical].status !== 'ok')

  console.log(`Manifest ok entries: ${entries.length}`)
  console.log(`Already restored:     ${entries.length - todo.length}`)
  console.log(`To upload:            ${todo.length}`)
  console.log(`Mode:                 ${GO ? 'LIVE' : 'DRY RUN'}`)
  console.log(`Target endpoint:      ${URL_ENDPOINT}`)

  if (!GO) {
    console.log('\nRe-run with --go to upload.')
    return
  }

  let done = 0
  let failed = 0
  let cursor = 0

  async function worker() {
    while (cursor < todo.length) {
      const entry = todo[cursor++]
      try {
        const r = await uploadOne(entry)
        result[entry.canonical] = { ...r, oldUrl: entry.canonical, aliases: entry.aliases || [] }
        if (r.status === 'ok') done++
        else {
          failed++
          console.warn(`  ✗ ${targetPath(entry)}: ${r.status} ${r.message || ''}`)
        }
      } catch (err) {
        failed++
        result[entry.canonical] = { status: 'error', message: String(err) }
        console.warn(`  ✗ ${targetPath(entry)}: ${err}`)
      }
      if ((done + failed) % 50 === 0) {
        await writeFile(RESULT, JSON.stringify(result, null, 2))
        console.log(`  …${done + failed}/${todo.length} (ok=${done} fail=${failed})`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await writeFile(RESULT, JSON.stringify(result, null, 2))
  console.log(`\nDone. uploaded=${done} failed=${failed}`)
  console.log(`Wrote ${RESULT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
