/**
 * Which store this build is, from the NATIVE application id (iOS bundle id /
 * Android package) — never from `Constants.expoConfig.extra`, which an
 * over-the-air update replaces. The server maps the id to a store.
 *
 * Expo Go and simulators running Expo Go report Expo Go's own id; those, and
 * a missing id, use the development identity the server serves from
 * APP_DEV_TENANT_SLUG (never in production).
 */
export const DEV_APPLICATION_ID = 'com.webnegosyo.customer.dev'

const EXPO_GO_IDS: ReadonlySet<string> = new Set(['host.exp.Exponent', 'host.exp.exponent'])

export function resolveApplicationId(nativeId: string | null | undefined): string {
  const id = nativeId?.trim()
  return id && !EXPO_GO_IDS.has(id) ? id : DEV_APPLICATION_ID
}
