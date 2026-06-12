#!/usr/bin/env node
/**
 * Cloudinary restore / re-upload.
 *
 * Reads cloudinary-backup/manifest.json and re-uploads every successfully
 * backed-up file to a target Cloudinary account, PRESERVING the original
 * public_id. With the same public_id:
 *   - re-uploading to the SAME cloud  -> identical delivery URLs (no DB change)
 *   - re-uploading to a NEW cloud      -> only the cloud name in the URL changes
 *
 * Auth: set CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>)
 * for the TARGET account in the environment, or pass --cloudinary-url=...
 *
 *   export CLOUDINARY_URL='cloudinary://KEY:SECRET@TARGET_CLOUD'
 *   node cloudinary-backup/restore.mjs                 # dry run (lists what it would do)
 *   node cloudinary-backup/restore.mjs --go            # actually upload
 *   node cloudinary-backup/restore.mjs --go --only-cloud=dns9deszp
 *
 * Output: cloudinary-backup/restore-result.json (old URL -> new URL map), which
 * relink-db.mjs can use to rewrite the database if cloud names changed.
 *
 * Uses signed uploads via the Cloudinary REST API (no SDK dependency).
 */
import { readFile, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const DIR = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(DIR, 'manifest.json')
const OUT = join(DIR, 'restore-result.json')
const GO = process.argv.includes('--go')
const ONLY_CLOUD = (process.argv.find((a) => a.startsWith('--only-cloud=')) || '').split('=')[1]
const CONCURRENCY = 5

function getCreds() {
  const arg = (process.argv.find((a) => a.startsWith('--cloudinary-url=')) || '').split('=').slice(1).join('=')
  const raw = arg || process.env.CLOUDINARY_URL
  if (!raw) throw new Error('Set CLOUDINARY_URL or pass --cloudinary-url=cloudinary://KEY:SECRET@CLOUD')
  const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
  if (!m) throw new Error('CLOUDINARY_URL must look like cloudinary://KEY:SECRET@CLOUD')
  return { apiKey: m[1], apiSecret: m[2], cloud: m[3] }
}

function sign(params, apiSecret) {
  const toSign = Object.keys(params).sort()
    .map((k) => `${k}=${params[k]}`).join('&')
  return createHash('sha1').update(toSign + apiSecret).digest('hex')
}

async function exists(p) { try { await stat(p); return true } catch { return false } }

async function uploadOne(entry, creds) {
  const fileAbs = join(DIR, entry.localPath)
  if (!(await exists(fileAbs))) return { status: 'missing_file' }

  const timestamp = Math.floor(Date.now() / 1000)
  // Preserve the public_id; Cloudinary derives format from the file bytes.
  const signParams = { overwrite: 'true', public_id: entry.publicId, timestamp: String(timestamp) }
  const signature = sign(signParams, creds.apiSecret)

  const form = new FormData()
  const buf = await readFile(fileAbs)
  form.append('file', new Blob([buf]), `${entry.publicId.split('/').pop()}.${entry.format || 'bin'}`)
  form.append('api_key', creds.apiKey)
  form.append('timestamp', String(timestamp))
  form.append('public_id', entry.publicId)
  form.append('overwrite', 'true')
  form.append('signature', signature)

  const resType = entry.resourceType || 'image'
  const res = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloud}/${resType}/upload`, {
    method: 'POST', body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { status: 'upload_error', httpStatus: res.status, error: json?.error?.message }
  return { status: 'ok', newUrl: json.secure_url, newCloud: creds.cloud }
}

async function main() {
  const creds = getCreds()
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  let entries = Object.values(manifest).filter((m) => m.status === 'ok')
  if (ONLY_CLOUD) entries = entries.filter((m) => m.cloud === ONLY_CLOUD)

  console.log(`Target cloud: ${creds.cloud}`)
  console.log(`Backed-up files available: ${entries.length}${ONLY_CLOUD ? ` (filtered to source cloud ${ONLY_CLOUD})` : ''}`)
  if (!GO) {
    console.log('\nDRY RUN — no uploads performed. Re-run with --go to upload.')
    console.log('Sample of what would be uploaded:')
    for (const e of entries.slice(0, 5)) {
      console.log(`  ${e.publicId}.${e.format}  ->  https://res.cloudinary.com/${creds.cloud}/${e.resourceType}/upload/${e.publicId}`)
    }
    return
  }

  const result = {}
  let cursor = 0, done = 0
  const counts = {}
  let cloudResult = {}
  if (await exists(OUT)) cloudResult = JSON.parse(await readFile(OUT, 'utf8'))

  async function worker() {
    while (cursor < entries.length) {
      const e = entries[cursor++]
      const r = await uploadOne(e, creds)
      counts[r.status] = (counts[r.status] || 0) + 1
      if (r.status === 'ok') cloudResult[e.url] = r.newUrl
      done++
      if (done % 25 === 0) {
        await writeFile(OUT, JSON.stringify(cloudResult, null, 2))
        console.log(`  ${done}/${entries.length}  ${JSON.stringify(counts)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await writeFile(OUT, JSON.stringify(cloudResult, null, 2))
  console.log('\n=== RESTORE DONE ===', JSON.stringify(counts, null, 2))
  console.log(`URL map written to ${OUT} (${Object.keys(cloudResult).length} entries)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
