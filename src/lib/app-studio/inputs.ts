/**
 * App Studio's inputs, checked the same way the database checks them
 * (`20261026150000_tenant_apps.sql`) plus the store limits the database can't
 * know (App Store name and listing lengths). Pure and client-safe: the editor
 * shows these messages before Save, the server actions refuse the same.
 */
import { z } from 'zod'

/** App Store Connect caps an app name at 30; the home screen shows about 12. */
export const APP_NAME_MAX = 30
export const HOME_SCREEN_NAME_VISIBLE = 12

const IOS_ID = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/
const ANDROID_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
const HEX = /^#[0-9A-Fa-f]{6}$/
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/

const https = z.string().trim().url().refine((value) => value.startsWith('https://'), 'Use an https:// link')
const optionalHttps = z.union([https, z.literal('').transform(() => null), z.null()])

export const APP_ID_PREFIX = 'com.webnegosyo'

/**
 * `com.webnegosyo.<slug>` for both stores. iOS takes letters, digits and
 * hyphens; Android lowercase letters, digits and underscores; both need each
 * part to start with a letter.
 */
export function defaultAppIds(slug: string): { bundleId: string; androidPackage: string } {
  const base = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'store'
  const lettered = /^[a-z]/.test(base) ? base : `s${base}`
  return {
    bundleId: `${APP_ID_PREFIX}.${lettered}`,
    androidPackage: `${APP_ID_PREFIX}.${lettered.replace(/-+/g, '_')}`,
  }
}

export const STORE_ACCOUNTS = ['webnegosyo', 'tenant'] as const

export const appIdentityInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Give the app a name').max(APP_NAME_MAX, `At most ${APP_NAME_MAX} characters (App Store limit)`),
  bundleId: z.string().trim().regex(IOS_ID, 'Like com.webnegosyo.mystore: letters, digits and hyphens, each part starting with a letter'),
  androidPackage: z.string().trim().regex(ANDROID_ID, 'Like com.webnegosyo.my_store: lowercase letters, digits and underscores'),
  iconUrl: optionalHttps,
  splashUrl: optionalHttps,
  splashBackground: z.union([z.string().trim().regex(HEX, 'A colour like #1A2B3C'), z.literal('').transform(() => null), z.null()]),
  storeAccount: z.object({ apple: z.enum(STORE_ACCOUNTS), google: z.enum(STORE_ACCOUNTS) }),
})

export type AppIdentityInput = z.infer<typeof appIdentityInputSchema>

/** The App Store's categories a food store would pick; Play maps them in P9. */
export const LISTING_CATEGORIES = ['food_and_drink', 'shopping', 'lifestyle'] as const

export const appListingInputSchema = z.object({
  subtitle: z.string().trim().max(30, 'At most 30 characters').default(''),
  promotionalText: z.string().trim().max(170, 'At most 170 characters').default(''),
  description: z.string().trim().max(4000, 'At most 4,000 characters').default(''),
  keywords: z.string().trim().max(100, 'At most 100 characters, comma-separated').default(''),
  supportUrl: optionalHttps.default(null),
  privacyUrl: optionalHttps.default(null),
  category: z.enum(LISTING_CATEGORIES).default('food_and_drink'),
})

export type AppListingInput = z.infer<typeof appListingInputSchema>

export const APP_STATUSES = ['draft', 'live', 'paused'] as const
export const PLAY_TRACKS = ['internal', 'alpha', 'beta', 'production'] as const

const optionalVersion = z.union([z.string().trim().regex(VERSION, 'Like 1.0.3'), z.literal('').transform(() => null), z.null()])

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index]
  return 0
}

export const appReleaseInputSchema = z
  .object({
    status: z.enum(APP_STATUSES),
    minVersionIos: optionalVersion,
    latestVersionIos: optionalVersion,
    minVersionAndroid: optionalVersion,
    latestVersionAndroid: optionalVersion,
    appStoreUrl: optionalHttps,
    playStoreUrl: optionalHttps,
    ascAppId: z.union([z.string().trim().regex(/^[0-9]{6,12}$/, 'The numeric App Store Connect id'), z.literal('').transform(() => null), z.null()]),
    playTrack: z.enum(PLAY_TRACKS),
  })
  .superRefine((release, context) => {
    // A floor above the latest build locks every customer out of the app.
    for (const [minimum, latest, path] of [
      [release.minVersionIos, release.latestVersionIos, 'minVersionIos'],
      [release.minVersionAndroid, release.latestVersionAndroid, 'minVersionAndroid'],
    ] as const) {
      if (minimum && latest && compareVersions(minimum, latest) > 0)
        context.addIssue({ code: 'custom', path: [path], message: 'The minimum cannot be newer than the latest version' })
      if (minimum && !latest) context.addIssue({ code: 'custom', path: [path], message: 'Set the latest version first' })
    }
  })

export type AppReleaseInput = z.infer<typeof appReleaseInputSchema>

/** The App Review number: a real-looking PH mobile nobody owns is fine; it is never texted. */
export const reviewPhoneSchema = z.string().trim().regex(/^\+639[0-9]{9}$/, 'A PH mobile like +639171234567')

/** The first problem as one sentence, for a toast or a field. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? issue.message : 'Check the form'
}
