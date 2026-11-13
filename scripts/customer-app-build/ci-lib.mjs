/**
 * Pure helpers for the build workflow (tested in tests/unit/app-builds/ci-lib.test.ts).
 * No dependencies: the workflow runs these before anything is installed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^#[0-9A-Fa-f]{6}$/
const HTTPS = /^https:\/\//
const BUNDLE = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/
const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

/**
 * The manifest as the web answered it, checked again here: the workflow puts
 * these values into env and file paths, so it trusts nothing it didn't check.
 */
export function readManifest(json) {
  const manifest = json && typeof json === 'object' ? json.manifest : null
  const problems = []
  if (!manifest || typeof manifest !== 'object') return { manifest: null, problems: ['the answer has no manifest'] }
  if (manifest.version !== 1) problems.push(`unknown manifest version ${manifest.version}`)
  if (!UUID.test(manifest.buildId ?? '')) problems.push('bad build id')
  if (manifest.platform !== 'ios' && manifest.platform !== 'android') problems.push('bad platform')
  const identity = manifest.identity ?? {}
  if (typeof identity.displayName !== 'string' || !identity.displayName.trim() || identity.displayName.length > 30 || /[\r\n]/.test(identity.displayName)) {
    problems.push('bad display name')
  }
  if (!BUNDLE.test(identity.bundleId ?? '')) problems.push('bad bundle id')
  if (!PACKAGE.test(identity.androidPackage ?? '')) problems.push('bad android package')
  if (!HEX.test(identity.splashBackground ?? '')) problems.push('bad splash colour')
  const assets = manifest.assets ?? {}
  if (!HTTPS.test(assets.iconUrl ?? '')) problems.push('bad icon url')
  if (assets.splashUrl !== null && !HTTPS.test(assets.splashUrl ?? '')) problems.push('bad splash url')
  if (manifest.message !== `wnb:${manifest.buildId}`) problems.push('bad build message')
  const submit = manifest.submit ?? {}
  if (typeof submit.enabled !== 'boolean') problems.push('bad submit flag')
  if (submit.ascAppId !== null && !/^[0-9]{6,12}$/.test(submit.ascAppId ?? '')) problems.push('bad App Store Connect id')
  if (submit.playTrack !== 'internal') problems.push('submissions go to the internal track only')
  return problems.length > 0 ? { manifest: null, problems } : { manifest, problems }
}

/**
 * The env the build step needs, as lines for $GITHUB_ENV. Values use the
 * heredoc form with a random delimiter, so a value can never inject a line.
 */
export function githubEnvLines(values, delimiter) {
  if (!/^[A-Za-z0-9_]{16,}$/.test(delimiter)) throw new Error('delimiter must be long and plain')
  return Object.entries(values)
    .map(([name, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`bad env name ${name}`)
      const text = String(value)
      if (text.includes(delimiter)) throw new Error(`value of ${name} contains the delimiter`)
      return `${name}<<${delimiter}\n${text}\n${delimiter}\n`
    })
    .join('')
}

/** Identity env `customer-app/app.config.ts` reads, with the generated asset paths. */
export function identityEnv(manifest, assetsDir, adaptiveBackground) {
  return {
    APP_PLATFORM: manifest.platform,
    APP_BUILD_MESSAGE: manifest.message,
    APP_NAME: manifest.identity.displayName,
    APP_BUNDLE_ID: manifest.identity.bundleId,
    APP_ANDROID_PACKAGE: manifest.identity.androidPackage,
    APP_SPLASH_BACKGROUND: manifest.identity.splashBackground,
    APP_ICON: `${assetsDir}/icon.png`,
    APP_ADAPTIVE_ICON: `${assetsDir}/adaptive-foreground.png`,
    APP_ADAPTIVE_MONOCHROME: `${assetsDir}/adaptive-monochrome.png`,
    APP_ADAPTIVE_BACKGROUND: adaptiveBackground,
    APP_NOTIFICATION_ICON: `${assetsDir}/notification-icon.png`,
    APP_SPLASH_IMAGE: `${assetsDir}/splash.png`,
    APP_SUBMIT: manifest.submit.enabled ? 'true' : 'false',
  }
}

/**
 * The EAS build id from `eas build --json` output. Expo doesn't document the
 * shape, so this accepts an array of builds or a single build object, and
 * takes the first UUID `id` it finds. Null: start reported without an id;
 * the webhook then finds the build by its `wnb:` message.
 */
export function easBuildIdFrom(output) {
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch {
    return null
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]
  for (const entry of list) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && UUID.test(entry.id)) return entry.id.toLowerCase()
  }
  return null
}

/**
 * eas.json with the submit profile filled in for this build: TestFlight with
 * the API key, or Play's internal track with the service account. Paths only;
 * the key files are written by the workflow from its secrets.
 */
export function withSubmitProfile(easJson, manifest, paths) {
  const next = structuredClone(easJson)
  next.submit = next.submit ?? {}
  const profile = { ...(next.submit.store ?? {}) }
  if (manifest.platform === 'ios') {
    profile.ios = {
      ...(profile.ios ?? {}),
      ascAppId: manifest.submit.ascAppId,
      ascApiKeyPath: paths.ascApiKeyPath,
      ascApiKeyId: paths.ascApiKeyId,
      ascApiKeyIssuerId: paths.ascApiKeyIssuerId,
      appleTeamId: paths.appleTeamId,
    }
  } else {
    profile.android = { ...(profile.android ?? {}), serviceAccountKeyPath: paths.googleServiceAccountKeyPath, track: manifest.submit.playTrack }
  }
  next.submit.store = profile
  return next
}
