#!/usr/bin/env node
/**
 * The build workflow's steps (.github/workflows/build-customer-app.yml).
 *
 *   node ci.mjs fetch-manifest            → build-work/manifest.json
 *   node ci.mjs prepare                   → customer-app/build-assets/*, identity env
 *   node ci.mjs submit-profile            → key files + customer-app/eas.json submit profile
 *   node ci.mjs report-started <eas.json> → POST /api/app-builds/report {started}
 *   node ci.mjs report-failed <reason>    → POST /api/app-builds/report {failed}
 *
 * Env: APP_BUILD_API_URL, APP_BUILD_CI_SECRET, BUILD_TOKEN (all from the
 * workflow), GITHUB_ENV (set by Actions). Nothing here prints a secret, the
 * token or a store's details: the repository is public, so its logs are too.
 */
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { easBuildIdFrom, githubEnvLines, identityEnv, readManifest, withSubmitProfile } from './ci-lib.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const WORK = path.join(ROOT, 'build-work')
const MANIFEST_FILE = path.join(WORK, 'manifest.json')
const APP_DIR = path.join(ROOT, 'customer-app')
const ASSETS_DIR = 'build-assets'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function need(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function apiHeaders() {
  return { 'x-app-build-secret': need('APP_BUILD_CI_SECRET'), Authorization: `Bearer ${need('BUILD_TOKEN')}` }
}

function apiUrl(route) {
  const base = need('APP_BUILD_API_URL').replace(/\/+$/, '')
  if (!/^https:\/\//.test(base) && !/^http:\/\/localhost(:\d+)?$/.test(base)) throw new Error('APP_BUILD_API_URL must be https')
  return `${base}${route}`
}

function exportEnv(values) {
  const file = process.env.GITHUB_ENV
  if (!file) return
  appendFileSync(file, githubEnvLines(values, `WNB_${randomBytes(12).toString('hex')}`))
}

function loadManifest() {
  const { manifest, problems } = readManifest(JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')))
  if (!manifest) throw new Error(`manifest refused: ${problems.join('; ')}`)
  return manifest
}

async function fetchManifest() {
  const response = await fetch(apiUrl('/api/app-builds/manifest'), { headers: apiHeaders(), signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`manifest request answered ${response.status}`)
  const json = await response.json()
  const { manifest, problems } = readManifest(json)
  if (!manifest) throw new Error(`manifest refused: ${problems.join('; ')}`)
  mkdirSync(WORK, { recursive: true })
  writeFileSync(MANIFEST_FILE, JSON.stringify(json))
  console.log(`manifest ok: ${manifest.platform} build`)
}

async function download(url) {
  if (!/^https:\/\//.test(url)) throw new Error('asset url must be https')
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`asset download answered ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!/^image\//.test(type)) throw new Error(`asset is not an image (${type || 'no type'})`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('asset is larger than 10 MB')
  return buffer
}

async function prepare() {
  const manifest = loadManifest()
  // Installed by the workflow just before this step (scripts/customer-app-build/package.json).
  const { makeAppAssets, checkAppAssets } = await import('./assets.mjs')
  const iconPng = await download(manifest.assets.iconUrl)
  const splashPng = manifest.assets.splashUrl ? await download(manifest.assets.splashUrl) : null
  const assets = await makeAppAssets({ iconPng, splashPng, splashBackground: manifest.identity.splashBackground })
  const problems = await checkAppAssets(assets.files)
  if (problems.length > 0) throw new Error(`generated assets failed their checks: ${problems.join('; ')}`)
  const out = path.join(APP_DIR, ASSETS_DIR)
  mkdirSync(out, { recursive: true })
  for (const [name, buffer] of Object.entries(assets.files)) writeFileSync(path.join(out, name), buffer)
  exportEnv(identityEnv(manifest, `./${ASSETS_DIR}`, assets.adaptiveBackground))
  console.log(`assets ok${assets.usedFallbackMark ? ' (notification icon: fallback glyph)' : ''}`)
}

function submitProfile() {
  const manifest = loadManifest()
  if (!manifest.submit.enabled) {
    exportEnv({ APP_SUBMIT: 'false' })
    console.log('not sending this build to testers')
    return
  }
  const keys = path.join(process.env.RUNNER_TEMP || WORK, 'store-keys')
  mkdirSync(keys, { recursive: true, mode: 0o700 })
  const paths = {}
  if (manifest.platform === 'ios') {
    paths.ascApiKeyPath = path.join(keys, 'asc-api-key.p8')
    writeFileSync(paths.ascApiKeyPath, need('ASC_API_KEY_P8'), { mode: 0o600 })
    paths.ascApiKeyId = need('ASC_API_KEY_ID')
    paths.ascApiKeyIssuerId = need('ASC_API_KEY_ISSUER_ID')
    paths.appleTeamId = need('APPLE_TEAM_ID')
    // The same key lets `eas build` repair iOS credentials without a prompt.
    exportEnv({
      EXPO_ASC_API_KEY_PATH: paths.ascApiKeyPath,
      EXPO_ASC_KEY_ID: paths.ascApiKeyId,
      EXPO_ASC_ISSUER_ID: paths.ascApiKeyIssuerId,
      EXPO_APPLE_TEAM_ID: paths.appleTeamId,
    })
  } else {
    paths.googleServiceAccountKeyPath = path.join(keys, 'play-service-account.json')
    writeFileSync(paths.googleServiceAccountKeyPath, need('PLAY_SERVICE_ACCOUNT_JSON'), { mode: 0o600 })
  }
  const easFile = path.join(APP_DIR, 'eas.json')
  writeFileSync(easFile, `${JSON.stringify(withSubmitProfile(JSON.parse(readFileSync(easFile, 'utf8')), manifest, paths), null, 2)}\n`)
  console.log('submit profile ok')
}

async function report(body) {
  const response = await fetch(apiUrl('/api/app-builds/report'), {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  console.log(`report ${body.event}: ${response.status}`)
  if (!response.ok && response.status !== 409) throw new Error(`report answered ${response.status}`)
}

async function reportStarted(file) {
  const easBuildId = easBuildIdFrom(readFileSync(file, 'utf8'))
  if (!easBuildId) {
    // The build exists on EAS; its webhook finds our row by the wnb: message.
    console.log('EAS build id not found in the CLI output; the webhook will match by message')
    return
  }
  await report({ event: 'started', easBuildId })
}

const [command, argument] = process.argv.slice(2)
const commands = {
  'fetch-manifest': fetchManifest,
  prepare,
  'submit-profile': submitProfile,
  'report-started': () => reportStarted(argument ?? path.join(WORK, 'eas-build.json')),
  'report-failed': () => report({ event: 'failed', reason: (argument || 'the build workflow failed').slice(0, 500) }),
}

if (!commands[command]) {
  console.error(`usage: ci.mjs ${Object.keys(commands).join(' | ')}`)
  process.exit(2)
}

Promise.resolve(commands[command]()).catch((error) => {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
