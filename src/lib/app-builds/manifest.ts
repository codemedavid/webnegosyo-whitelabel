/**
 * What a build is told (pure). App Studio snapshots it into
 * `tenant_app_builds.manifest` when the build is started, and the workflow
 * fetches exactly that snapshot: an edit made while the build runs never
 * changes what is being built.
 *
 * The workflow turns `identity` into the env `customer-app/app.config.ts`
 * reads (APP_NAME, APP_BUNDLE_ID, …) and `assets` into icon/splash files.
 */
import type { BuildPlatform } from './status'

export const MANIFEST_VERSION = 1

/** The EAS build message carries this, so the webhook can find a build whose id never came back. */
export const BUILD_MESSAGE_PREFIX = 'wnb:'

export interface AppBuildManifest {
  version: typeof MANIFEST_VERSION
  buildId: string
  platform: BuildPlatform
  /** EAS `--message`: `wnb:<build id>`. */
  message: string
  identity: {
    displayName: string
    bundleId: string
    androidPackage: string
    splashBackground: string
  }
  assets: {
    iconUrl: string
    /** Null: the splash shows the icon on the splash colour. */
    splashUrl: string | null
  }
  /**
   * Sending to testers only, never to the public: iOS goes to TestFlight
   * (needs the App Store Connect id), Android to the Play internal track
   * whatever the app's release track says. Promotion stays a person's step.
   */
  submit: {
    enabled: boolean
    ascAppId: string | null
    playTrack: 'internal'
  }
}

/** The `tenant_apps` columns a build reads. */
export interface BuildableApp {
  display_name: string
  bundle_id: string
  android_package: string
  icon_url: string | null
  splash_url: string | null
  splash_background: string | null
  asc_app_id: string | null
}

const HEX = /^#[0-9A-Fa-f]{6}$/
const HTTPS = /^https:\/\//

/** What stops this app from being built, worded for App Studio. Empty = buildable. */
export function buildProblems(app: BuildableApp): string[] {
  const problems: string[] = []
  if (!app.icon_url || !HTTPS.test(app.icon_url)) problems.push('Add an app icon (Identity tab).')
  if (!app.splash_background || !HEX.test(app.splash_background)) problems.push('Pick a splash colour (Identity tab).')
  if (app.splash_url && !HTTPS.test(app.splash_url)) problems.push('The splash image must be an https link (Identity tab).')
  if (!app.display_name.trim()) problems.push('Give the app a name (Identity tab).')
  return problems
}

/** Why a platform's build will not be sent to testers, or null when it will be. */
export function submitNote(app: BuildableApp, platform: BuildPlatform): string | null {
  if (platform === 'ios' && !app.asc_app_id) {
    return 'Not sent to TestFlight: add the App Store Connect app id under Release first.'
  }
  return null
}

export function buildManifest(app: BuildableApp, buildId: string, platform: BuildPlatform): AppBuildManifest {
  const problems = buildProblems(app)
  if (problems.length > 0) throw new Error(`app is not buildable: ${problems.join(' ')}`)
  return {
    version: MANIFEST_VERSION,
    buildId,
    platform,
    message: `${BUILD_MESSAGE_PREFIX}${buildId}`,
    identity: {
      displayName: app.display_name.trim(),
      bundleId: app.bundle_id,
      androidPackage: app.android_package,
      splashBackground: (app.splash_background as string).toUpperCase(),
    },
    assets: { iconUrl: app.icon_url as string, splashUrl: app.splash_url },
    submit: {
      enabled: submitNote(app, platform) === null,
      ascAppId: platform === 'ios' ? app.asc_app_id : null,
      playTrack: 'internal',
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The build id in an EAS build message we wrote, or null. */
export function buildIdFromMessage(message: unknown): string | null {
  if (typeof message !== 'string' || !message.startsWith(BUILD_MESSAGE_PREFIX)) return null
  const id = message.slice(BUILD_MESSAGE_PREFIX.length).trim()
  return UUID.test(id) ? id.toLowerCase() : null
}
