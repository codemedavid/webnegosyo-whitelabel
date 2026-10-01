/**
 * Routing for Apple's PassKit web service (developer.apple.com, "Wallet Passes
 * Web Service"). Pure: turns a method + path into one of five calls, and
 * refuses everything else — including identifiers with characters no real
 * device or pass would send, so nothing unvalidated reaches a query.
 */

import { isPassSerial } from './member-code'

export type AppleWebServiceRoute =
  | { kind: 'register'; deviceId: string; passTypeId: string; serial: string }
  | { kind: 'unregister'; deviceId: string; passTypeId: string; serial: string }
  | { kind: 'list_updated'; deviceId: string; passTypeId: string }
  | { kind: 'latest_pass'; passTypeId: string; serial: string }
  | { kind: 'log' }
  | { kind: 'unknown' }

const DEVICE_ID = /^[A-Za-z0-9]{1,128}$/
const PASS_TYPE_ID = /^pass\.[A-Za-z0-9.-]{1,200}$/

const UNKNOWN: AppleWebServiceRoute = { kind: 'unknown' }

export function parseAppleWebServiceRoute(method: string, segments: readonly string[]): AppleWebServiceRoute {
  const [version, resource, ...rest] = segments
  if (version !== 'v1') return UNKNOWN

  if (resource === 'log' && rest.length === 0) return method === 'POST' ? { kind: 'log' } : UNKNOWN

  if (resource === 'passes' && rest.length === 2 && method === 'GET') {
    const [passTypeId, serial] = rest
    return PASS_TYPE_ID.test(passTypeId) && isPassSerial(serial) ? { kind: 'latest_pass', passTypeId, serial } : UNKNOWN
  }

  if (resource !== 'devices' || rest[1] !== 'registrations') return UNKNOWN
  const [deviceId, , passTypeId, serial] = rest
  if (!DEVICE_ID.test(deviceId ?? '') || !PASS_TYPE_ID.test(passTypeId ?? '')) return UNKNOWN

  if (rest.length === 3) return method === 'GET' ? { kind: 'list_updated', deviceId, passTypeId } : UNKNOWN
  if (rest.length !== 4 || !isPassSerial(serial)) return UNKNOWN
  if (method === 'POST') return { kind: 'register', deviceId, passTypeId, serial }
  if (method === 'DELETE') return { kind: 'unregister', deviceId, passTypeId, serial }
  return UNKNOWN
}
