/**
 * Wallet credentials from deployment configuration.
 *
 * Each wallet fails closed on its own: a missing or malformed piece turns
 * that wallet OFF (the "Add to …" button is simply not offered) rather than
 * issuing passes that cannot be updated or signed. Never log these values.
 *
 * PEMs and the Google key are base64-encoded so they survive single-line env
 * editors (Vercel) without newline mangling.
 */

const DEFAULT_PUBLIC_BASE_URL = 'https://www.webnegosyo.com'
const MIN_SECRET_BYTES = 32

type Env = Record<string, string | undefined>

export interface AppleWalletConfig {
  passTypeIdentifier: string
  teamIdentifier: string
  webServiceURL: string
  signerCert: string
  signerKey: string
  signerKeyPassphrase: string | undefined
  wwdr: string
  authSecret: Buffer
}

export interface GoogleWalletConfig {
  issuerId: string
  serviceAccountEmail: string
  privateKey: string
}

export interface WalletConfig {
  publicBaseUrl: string
  apple: AppleWalletConfig | null
  google: GoogleWalletConfig | null
}

function decodeBase64(value: string | undefined): string | null {
  if (!value || !/^[A-Za-z0-9+/=\s]+$/.test(value)) return null
  const decoded = Buffer.from(value, 'base64').toString('utf8')
  return decoded.length > 0 ? decoded : null
}

function decodePem(value: string | undefined, label: RegExp): string | null {
  const pem = decodeBase64(value)
  return pem && label.test(pem) ? pem : null
}

function decodeSecret(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9+/_-]+=*$/.test(value)) return null
  const decoded = Buffer.from(value, value.includes('-') || value.includes('_') ? 'base64url' : 'base64')
  return decoded.length >= MIN_SECRET_BYTES ? decoded : null
}

function resolveBaseUrl(value: string | undefined): string {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' ? url.origin : DEFAULT_PUBLIC_BASE_URL
  } catch {
    return DEFAULT_PUBLIC_BASE_URL
  }
}

function loadApple(env: Env, publicBaseUrl: string): AppleWalletConfig | null {
  const passTypeIdentifier = env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? ''
  const teamIdentifier = env.APPLE_WALLET_TEAM_ID?.trim() ?? ''
  const signerCert = decodePem(env.APPLE_WALLET_CERT_PEM_B64, /-----BEGIN CERTIFICATE-----/)
  const signerKey = decodePem(env.APPLE_WALLET_KEY_PEM_B64, /-----BEGIN (RSA |ENCRYPTED )?PRIVATE KEY-----/)
  const wwdr = decodePem(env.APPLE_WALLET_WWDR_PEM_B64, /-----BEGIN CERTIFICATE-----/)
  const authSecret = decodeSecret(env.WALLET_PASS_AUTH_SECRET)

  if (!/^pass\.[A-Za-z0-9.-]+$/.test(passTypeIdentifier) || !/^[A-Z0-9]{10}$/.test(teamIdentifier)) return null
  if (!signerCert || !signerKey || !wwdr || !authSecret) return null

  return {
    passTypeIdentifier,
    teamIdentifier,
    webServiceURL: `${publicBaseUrl}/api/loyalty/passes/apple-ws`,
    signerCert,
    signerKey,
    signerKeyPassphrase: env.APPLE_WALLET_KEY_PASSPHRASE || undefined,
    wwdr,
    authSecret,
  }
}

function loadGoogle(env: Env): GoogleWalletConfig | null {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID?.trim() ?? ''
  if (!/^[0-9]{6,32}$/.test(issuerId)) return null

  const raw = decodeBase64(env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_B64)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown }
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null
    if (!parsed.private_key.includes('PRIVATE KEY')) return null
    return { issuerId, serviceAccountEmail: parsed.client_email, privateKey: parsed.private_key }
  } catch {
    return null
  }
}

export function loadWalletConfig(env: Env = process.env): WalletConfig {
  const publicBaseUrl = resolveBaseUrl(env.WALLET_PUBLIC_BASE_URL)
  return {
    publicBaseUrl,
    apple: loadApple(env, publicBaseUrl),
    google: loadGoogle(env),
  }
}

/** Which "Add to … Wallet" buttons a customer may be shown. */
export interface WalletAvailability {
  apple: boolean
  google: boolean
}

export function readWalletAvailability(env: Env = process.env): WalletAvailability {
  const config = loadWalletConfig(env)
  return { apple: config.apple !== null, google: config.google !== null }
}
