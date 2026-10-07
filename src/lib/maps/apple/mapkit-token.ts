/**
 * MapKit JS / Apple Maps Server API tokens. Server only: the private key never
 * leaves this process. One ES256 JWT shape serves both APIs — a browser token
 * carries an `origin` claim (Apple checks it against the page's Origin header),
 * a server token does not.
 *
 * Signed with node:crypto (`ieee-p1363` gives the raw r||s signature JWS needs),
 * so no JWT dependency.
 */

import 'server-only'
import { createPrivateKey, sign } from 'node:crypto'

export interface MapKitConfig {
  teamId: string
  keyId: string
  /** PKCS#8 PEM, as downloaded from Apple (the `.p8` file). */
  privateKey: string
}

export interface SignMapKitTokenOptions {
  now?: Date
  ttlSeconds: number
  /** The page origin a browser token is bound to. Omit for server tokens. */
  origin?: string
}

type EnvLike = Record<string, string | undefined>

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** Null until the team id, key id and key are all set: maps fail closed. */
export function readMapKitConfig(env: EnvLike = process.env): MapKitConfig | null {
  const teamId = env.APPLE_MAPKIT_TEAM_ID?.trim()
  const keyId = env.APPLE_MAPKIT_KEY_ID?.trim()
  // Env dashboards often store a PEM on one line with literal "\n".
  const privateKey = env.APPLE_MAPKIT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!teamId || !keyId || !privateKey) return null
  return { teamId, keyId, privateKey }
}

export function signMapKitToken(config: MapKitConfig, options: SignMapKitTokenOptions): string {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000)
  const header = base64UrlJson({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })
  const payload = base64UrlJson({
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + options.ttlSeconds,
    ...(options.origin ? { origin: options.origin } : {}),
  })
  const signingInput = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${signature.toString('base64url')}`
}
