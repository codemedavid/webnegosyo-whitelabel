/**
 * The shape of a Messenger link token (`link-token.ts`), safe for the browser:
 * the storefront only checks the shape before keeping a token, and the server
 * checks the signature every time it is used.
 */

export const MESSENGER_LINK_QUERY_PARAM = 'm'

export const MESSENGER_LINK_TOKEN_PATTERN = /^mt1\.(\d{1,12})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/

export function looksLikeMessengerLinkToken(value: unknown): value is string {
  return typeof value === 'string' && MESSENGER_LINK_TOKEN_PATTERN.test(value)
}
