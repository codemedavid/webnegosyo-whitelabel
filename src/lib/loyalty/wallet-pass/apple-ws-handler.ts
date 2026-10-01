/**
 * Apple Wallet web service behaviour, behind ports so it is testable without
 * Postgres or a signing certificate.
 *
 * Authentication follows Apple's contract: registration and pass downloads
 * carry `ApplePass <token>`, which must be the token derived for THAT serial;
 * the "what changed" listing is unauthenticated by design and reveals only
 * serials already registered to the calling device id.
 */

import type { AppleWebServiceRoute } from './apple-ws-route'
import { readApplePassAuthorization, verifyAppleAuthToken } from './auth-token'

const PUSH_TOKEN = /^[A-Za-z0-9]{1,256}$/
const MAX_LOG_LINES = 20
const MAX_LOG_LINE_LENGTH = 500

export interface AppleWsPass {
  id: string
  serial: string
  contentUpdatedAt: string
}

export interface AppleWsDeps {
  passTypeIdentifier: string
  authSecret: Buffer
  findPass: (serial: string) => Promise<AppleWsPass | null>
  register: (passId: string, deviceId: string, pushToken: string) => Promise<boolean>
  unregister: (passId: string, deviceId: string) => Promise<void>
  listUpdated: (deviceId: string, since: string | null) => Promise<Array<{ serial: string; updatedAt: string }>>
  /** Refreshes the card and returns the signed pass with its current modification time. */
  buildLatest: (passId: string) => Promise<{ pkpass: Buffer; updatedAt: string } | null>
  log: (lines: string[]) => void
}

export interface AppleWsRequest {
  authorization: string | null
  body: unknown
  ifModifiedSince: string | null
  passesUpdatedSince: string | null
}

export type AppleWsResponse =
  | { status: 200 | 201 | 204 | 304 | 400 | 401 | 404 }
  | { status: 200; json: { serialNumbers: string[]; lastUpdated: string } }
  | { status: 200; pkpass: Buffer; lastModified: string }

async function authorizedPass(
  deps: AppleWsDeps,
  passTypeId: string,
  serial: string,
  authorization: string | null,
): Promise<AppleWsPass | null> {
  if (passTypeId !== deps.passTypeIdentifier) return null
  if (!verifyAppleAuthToken(deps.authSecret, serial, readApplePassAuthorization(authorization))) return null
  return deps.findPass(serial)
}

function readPushToken(body: unknown): string | null {
  const token = (body as { pushToken?: unknown } | null)?.pushToken
  return typeof token === 'string' && PUSH_TOKEN.test(token) ? token : null
}

/** HTTP dates have second precision; compare at that precision or a fresh pass never 304s. */
function isNotModified(updatedAt: string, ifModifiedSince: string | null): boolean {
  if (!ifModifiedSince) return false
  const since = Date.parse(ifModifiedSince)
  return Number.isFinite(since) && Math.floor(Date.parse(updatedAt) / 1000) * 1000 <= since
}

export async function handleAppleWebService(
  route: AppleWebServiceRoute,
  request: AppleWsRequest,
  deps: AppleWsDeps,
): Promise<AppleWsResponse> {
  switch (route.kind) {
    case 'register': {
      const pass = await authorizedPass(deps, route.passTypeId, route.serial, request.authorization)
      if (!pass) return { status: 401 }
      const pushToken = readPushToken(request.body)
      if (!pushToken) return { status: 400 }
      const isNew = await deps.register(pass.id, route.deviceId, pushToken)
      return { status: isNew ? 201 : 200 }
    }
    case 'unregister': {
      const pass = await authorizedPass(deps, route.passTypeId, route.serial, request.authorization)
      if (!pass) return { status: 401 }
      await deps.unregister(pass.id, route.deviceId)
      return { status: 200 }
    }
    case 'list_updated': {
      if (route.passTypeId !== deps.passTypeIdentifier) return { status: 404 }
      const since = request.passesUpdatedSince && Number.isFinite(Date.parse(request.passesUpdatedSince))
        ? request.passesUpdatedSince
        : null
      const updated = await deps.listUpdated(route.deviceId, since)
      if (updated.length === 0) return { status: 204 }
      const lastUpdated = updated.map((pass) => pass.updatedAt).sort().at(-1) as string
      return { status: 200, json: { serialNumbers: updated.map((pass) => pass.serial), lastUpdated } }
    }
    case 'latest_pass': {
      const pass = await authorizedPass(deps, route.passTypeId, route.serial, request.authorization)
      if (!pass) return { status: 401 }
      if (isNotModified(pass.contentUpdatedAt, request.ifModifiedSince)) return { status: 304 }
      const latest = await deps.buildLatest(pass.id)
      if (!latest) return { status: 404 }
      return { status: 200, pkpass: latest.pkpass, lastModified: new Date(latest.updatedAt).toUTCString() }
    }
    case 'log': {
      const logs = (request.body as { logs?: unknown } | null)?.logs
      if (Array.isArray(logs)) {
        deps.log(logs.slice(0, MAX_LOG_LINES).map((line) =>
          // Device text: strip control characters so it cannot forge log lines.
          String(line).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_LOG_LINE_LENGTH)))
      }
      return { status: 200 }
    }
    default:
      return { status: 404 }
  }
}
