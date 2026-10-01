/**
 * Google Wallet: the signed "Save to Google Wallet" link, and PATCHes that keep
 * a saved card current.
 *
 * Both authenticate with the issuer's service-account key using RS256 JWTs
 * signed by node:crypto — no SDK. The OAuth access token is cached per
 * runtime until shortly before it expires.
 */

import 'server-only'
import { createSign } from 'node:crypto'
import type { GoogleWalletConfig } from './config'
import type { GoogleLoyaltyClass, GoogleLoyaltyObject, GoogleSaveClaims } from './google-objects'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SAVE_URL = 'https://pay.google.com/gp/v/save'
const ISSUER_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'
const REQUEST_TIMEOUT_MS = 8000
const TOKEN_LIFETIME_SECONDS = 3600
const TOKEN_REFRESH_MARGIN_MS = 60_000

export function signRs256Jwt(claims: object, privateKey: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url')
  return `${unsigned}.${signature}`
}

export function buildGoogleSaveUrl(config: GoogleWalletConfig, claims: GoogleSaveClaims): string {
  return `${SAVE_URL}/${signRs256Jwt(claims, config.privateKey)}`
}

let cachedToken: { value: string; expiresAt: number; email: string } | null = null

async function getAccessToken(config: GoogleWalletConfig): Promise<string> {
  if (cachedToken && cachedToken.email === config.serviceAccountEmail && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }
  const now = Math.floor(Date.now() / 1000)
  const assertion = signRs256Jwt({
    iss: config.serviceAccountEmail,
    scope: ISSUER_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  }, config.privateKey)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`)
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Google token exchange returned no token')

  cachedToken = {
    value: body.access_token,
    email: config.serviceAccountEmail,
    expiresAt: Date.now() + (body.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000 - TOKEN_REFRESH_MARGIN_MS,
  }
  return cachedToken.value
}

/** 'not_found' means the member never saved the card to Google — not an error. */
async function patchResource(
  config: GoogleWalletConfig,
  resource: 'loyaltyObject' | 'loyaltyClass',
  body: GoogleLoyaltyObject | GoogleLoyaltyClass,
): Promise<'updated' | 'not_found'> {
  const token = await getAccessToken(config)
  const response = await fetch(`${WALLET_API}/${resource}/${encodeURIComponent(body.id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (response.status === 404) return 'not_found'
  if (!response.ok) throw new Error(`Google ${resource} update failed (${response.status})`)
  return 'updated'
}

/** Create the class/object, or bring an existing one up to date (409 on insert = it exists). */
async function upsertResource(
  config: GoogleWalletConfig,
  resource: 'loyaltyObject' | 'loyaltyClass',
  body: GoogleLoyaltyObject | GoogleLoyaltyClass,
): Promise<void> {
  const token = await getAccessToken(config)
  const response = await fetch(`${WALLET_API}/${resource}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (response.ok) return
  if (response.status !== 409) throw new Error(`Google ${resource} insert failed (${response.status})`)
  const outcome = await patchResource(config, resource, body)
  if (outcome === 'not_found') throw new Error(`Google ${resource} vanished between insert and update`)
}

export async function upsertGoogleLoyaltyCard(
  config: GoogleWalletConfig,
  loyaltyClass: GoogleLoyaltyClass,
  loyaltyObject: GoogleLoyaltyObject,
): Promise<void> {
  // The object references the class, so the class must exist first.
  await upsertResource(config, 'loyaltyClass', loyaltyClass)
  await upsertResource(config, 'loyaltyObject', loyaltyObject)
}

export function patchGoogleLoyaltyObject(config: GoogleWalletConfig, object: GoogleLoyaltyObject) {
  return patchResource(config, 'loyaltyObject', object)
}

export function patchGoogleLoyaltyClass(config: GoogleWalletConfig, loyaltyClass: GoogleLoyaltyClass) {
  return patchResource(config, 'loyaltyClass', loyaltyClass)
}
