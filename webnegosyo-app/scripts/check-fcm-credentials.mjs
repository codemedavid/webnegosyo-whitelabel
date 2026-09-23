#!/usr/bin/env node
/**
 * Refuses an Android build whose Firebase project does not match the FCM key
 * Expo pushes with.
 *
 * Android push has two halves that are configured in different places and are
 * never checked against each other:
 *
 *   - the BUILD half: `google-services.json`, compiled into the APK. It binds
 *     every device token to one Firebase project (its sender id).
 *   - the SEND half: the FCM V1 service-account key uploaded to EAS. Expo
 *     signs every push with it.
 *
 * When the two name different Firebase projects, FCM rejects every message
 * with `MismatchSenderId` — and nothing upstream notices: Expo's send API
 * still answers HTTP 200 with a clean ticket per device, and the refusal shows
 * up only in a push *receipt* that nobody was fetching. That is exactly what
 * happened here: `google-services.json` was regenerated from a new Firebase
 * project weeks after the FCM key was uploaded from the old one, and from then
 * on every Android merchant device went silent while every send reported
 * success.
 *
 * One HTTP call at build time makes that impossible to ship twice.
 *
 * Usage:  node scripts/check-fcm-credentials.mjs
 * Env:
 *   GOOGLE_SERVICES_JSON  path to the file the build will use (default
 *                         ./google-services.json)
 *   EXPO_TOKEN            EAS access token. Without one, the local Expo CLI
 *                         session is used; without that, the remote half
 *                         cannot be read and the check reports SKIPPED.
 *   EAS_PROJECT_FULL_NAME @account/slug to read credentials for (default
 *                         @itscodemedavid/webnegosyo-app)
 *   EXPO_API_URL          GraphQL endpoint (default https://api.expo.dev/graphql)
 *   FCM_CHECK_STRICT      "true" makes an unverifiable check fail instead of skip
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULT_PROJECT = '@itscodemedavid/webnegosyo-app'
const DEFAULT_API_URL = 'https://api.expo.dev/graphql'

/** Exit codes, so the workflow step reads as pass / fail / could-not-check. */
const OK = 0
const MISMATCH = 1

function fail(message) {
  console.error(`FCM credential check FAILED\n${message}`)
  process.exit(MISMATCH)
}

function skip(message) {
  if (process.env.FCM_CHECK_STRICT === 'true') {
    fail(`${message}\n(FCM_CHECK_STRICT=true, so this counts as a failure.)`)
  }
  console.warn(`FCM credential check SKIPPED — ${message}`)
  process.exit(OK)
}

/** The Firebase project the built app will register its device tokens with. */
function readBuildProject(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    fail(
      `Could not read google-services.json at ${path}.\n` +
        'An Android build without it has no Firebase config at all, so push cannot work.'
    )
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    fail(`google-services.json at ${path} is not valid JSON: ${error.message}`)
  }
  const projectId = parsed?.project_info?.project_id
  if (typeof projectId !== 'string' || projectId === '') {
    fail(`google-services.json at ${path} has no project_info.project_id.`)
  }
  return { projectId, senderId: parsed?.project_info?.project_number ?? 'unknown' }
}

/** The Expo session to read credentials with, or null when there is none. */
function readSessionSecret() {
  if (process.env.EXPO_TOKEN) return { header: 'authorization', value: `Bearer ${process.env.EXPO_TOKEN}` }
  try {
    const state = JSON.parse(readFileSync(join(homedir(), '.expo', 'state.json'), 'utf8'))
    const secret = state?.auth?.sessionSecret
    if (typeof secret === 'string' && secret !== '') return { header: 'expo-session', value: secret }
  } catch {
    // No local CLI session — handled by the caller.
  }
  return null
}

const CREDENTIALS_QUERY = `query AndroidFcm($fullName: String!) {
  app {
    byFullName(fullName: $fullName) {
      androidAppCredentials {
        applicationIdentifier
        androidFcm { id }
        googleServiceAccountKeyForFcmV1 { projectIdentifier clientEmail }
      }
    }
  }
}`

/** What EAS will sign pushes with, or null when it could not be read. */
async function readCredentialProjects(apiUrl, fullName, session) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [session.header]: session.value },
    body: JSON.stringify({ query: CREDENTIALS_QUERY, variables: { fullName } }),
  })
  if (!response.ok) return null
  const body = await response.json()
  const credentials = body?.data?.app?.byFullName?.androidAppCredentials
  if (!Array.isArray(credentials)) return null
  return credentials.map((entry) => ({
    applicationIdentifier: entry?.applicationIdentifier ?? 'unknown',
    projectIdentifier: entry?.googleServiceAccountKeyForFcmV1?.projectIdentifier ?? null,
    hasLegacyFcm: Boolean(entry?.androidFcm?.id),
  }))
}

async function main() {
  const path = resolve(process.env.GOOGLE_SERVICES_JSON ?? 'google-services.json')
  const build = readBuildProject(path)

  const session = readSessionSecret()
  if (!session) {
    skip('no EXPO_TOKEN and no local Expo session, so the EAS credential could not be read.')
  }

  const fullName = process.env.EAS_PROJECT_FULL_NAME ?? DEFAULT_PROJECT
  const apiUrl = process.env.EXPO_API_URL ?? DEFAULT_API_URL

  let credentials
  try {
    credentials = await readCredentialProjects(apiUrl, fullName, session)
  } catch (error) {
    skip(`could not reach ${apiUrl}: ${error.message}`)
  }
  if (credentials === null) skip(`${apiUrl} did not return Android credentials for ${fullName}.`)
  if (credentials.length === 0) {
    fail(
      `${fullName} has no Android credentials on EAS, so Expo has nothing to sign pushes with.\n` +
        'Upload an FCM V1 service-account key: eas credentials -p android'
    )
  }

  const mismatched = credentials.filter((entry) => entry.projectIdentifier !== build.projectId)
  if (mismatched.length === 0) {
    console.log(
      `FCM credential check OK — build and EAS credential both use Firebase project ` +
        `"${build.projectId}" (sender ${build.senderId}).`
    )
    process.exit(OK)
  }

  const lines = mismatched.map((entry) => {
    const credential = entry.projectIdentifier
      ? `FCM V1 key for Firebase project "${entry.projectIdentifier}"`
      : entry.hasLegacyFcm
        ? 'only a legacy FCM server key (the legacy API is shut down — Expo needs an FCM V1 key)'
        : 'no FCM V1 key at all'
    return `  ${entry.applicationIdentifier}: ${credential}`
  })

  fail(
    `${path} builds against Firebase project "${build.projectId}" (sender ${build.senderId}), ` +
      `but EAS holds:\n${lines.join('\n')}\n\n` +
      'Every Android push will be dropped by FCM with MismatchSenderId, while Expo still reports\n' +
      'a clean send. Fix the SEND half — no rebuild needed, credentials are read at push time:\n' +
      `  1. Firebase console → project "${build.projectId}" → Project settings → Service accounts\n` +
      '     → Generate new private key (downloads a .json).\n' +
      '  2. eas credentials -p android → production → Google Service Account\n' +
      '     → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → upload it.\n' +
      '  3. Re-run this check.'
  )
}

main().catch((error) => {
  fail(`unexpected error: ${error?.stack ?? error}`)
})
