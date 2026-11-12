/**
 * The customer app sends its NATIVE application id (iOS bundle id / Android
 * package) as `X-App-Id`; the server maps it to a store through tenant_apps.
 * Only the shape is checked here — an unknown id simply resolves to no store.
 */
const APP_ID_HEADER = 'x-app-id'
const MAX_APP_ID_LENGTH = 155
const REVERSE_DNS = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/

interface HeaderReader {
  get(name: string): string | null
}

export function readApplicationId(headers: HeaderReader): string | null {
  const value = headers.get(APP_ID_HEADER)?.trim() ?? ''
  if (value.length === 0 || value.length > MAX_APP_ID_LENGTH) return null
  return REVERSE_DNS.test(value) ? value : null
}
