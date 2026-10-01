/**
 * Tells iPhones that a card changed. Wallet push notifications are empty
 * (`{}`) and signed with the SAME pass type certificate over HTTP/2; the device
 * then asks our web service which serials changed and downloads them.
 *
 * APNs answers per token. A 410 (or a token APNs calls bad) means the pass is
 * gone from that device, and the registration is pruned by the caller.
 */

import 'server-only'
import { connect } from 'node:http2'
import type { AppleWalletConfig } from './config'

const APNS_ORIGIN = 'https://api.push.apple.com'
const PUSH_TIMEOUT_MS = 8000
const GONE_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

export type ApplePushOutcome = 'sent' | 'gone' | 'failed'

/** Pure: what one APNs reply means for the registration. */
export function classifyApnsResponse(status: number, body: string): ApplePushOutcome {
  if (status === 200) return 'sent'
  if (status === 410) return 'gone'
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason
    if (typeof reason === 'string' && GONE_REASONS.has(reason)) return 'gone'
  } catch {
    // An unreadable error body is just a failure.
  }
  return 'failed'
}

export interface ApplePushResult {
  sent: number
  failed: number
  goneTokens: string[]
}

export async function pushApplePassUpdate(config: AppleWalletConfig, pushTokens: readonly string[]): Promise<ApplePushResult> {
  const result: ApplePushResult = { sent: 0, failed: 0, goneTokens: [] }
  if (pushTokens.length === 0) return result

  const session = connect(APNS_ORIGIN, {
    cert: config.signerCert,
    key: config.signerKey,
    passphrase: config.signerKeyPassphrase,
  })
  session.on('error', (error) => console.error('[wallet-pass] APNs session error:', error.message))

  const pushOne = (token: string) => new Promise<ApplePushOutcome>((resolve) => {
    const request = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'apns-topic': config.passTypeIdentifier,
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    const timer = setTimeout(() => {
      request.close()
      resolve('failed')
    }, PUSH_TIMEOUT_MS)
    request.on('response', (headers) => { status = Number(headers[':status']) })
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { body += chunk })
    request.on('end', () => {
      clearTimeout(timer)
      resolve(classifyApnsResponse(status, body))
    })
    request.on('error', () => {
      clearTimeout(timer)
      resolve('failed')
    })
    request.end('{}')
  })

  try {
    const outcomes = await Promise.all(pushTokens.map(pushOne))
    outcomes.forEach((outcome, index) => {
      if (outcome === 'sent') result.sent += 1
      else if (outcome === 'gone') result.goneTokens.push(pushTokens[index])
      else result.failed += 1
    })
    return result
  } finally {
    session.close()
  }
}
