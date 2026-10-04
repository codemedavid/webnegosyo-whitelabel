/**
 * Semaphore (semaphore.co) — the paid fallback that sends a reward code when
 * none of the store's gateway phones is online. The store brings its own key,
 * so its own credits pay for the messages.
 *
 * The OTP route is used deliberately: it is Semaphore's priority path (not
 * throttled like /messages) and takes our code via `code`, substituted for the
 * `{otp}` placeholder. Without the placeholder Semaphore APPENDS the code, so
 * a template without one is refused before any call is made.
 *
 * No retries here: a send that may have happened must not happen twice. The
 * customer requests a new code instead.
 */

import { OTP_PLACEHOLDER } from './otp-message'

const API = 'https://api.semaphore.co/api/v4'
export const SEMAPHORE_TIMEOUT_MS = 8_000

export interface SemaphoreConfig {
  apiKey: string
  /** Approved sender name; null uses the account default. */
  senderName: string | null
}

export type SemaphoreSendResult = { ok: true } | { ok: false; reason: 'rejected' | 'unreachable' }
export type SemaphoreKeyCheck = { ok: true } | { ok: false; reason: 'invalid_key' | 'unreachable' }

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>
interface CallOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export function isSemaphoreApiKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{16,64}$/.test(value)
}

/** Semaphore sender names are at most 11 letters, digits or spaces. */
export function isSemaphoreSenderName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9 ]{1,11}$/.test(value)
}

async function call(url: string, init: RequestInit, { fetchImpl = fetch, timeoutMs = SEMAPHORE_TIMEOUT_MS }: CallOptions) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json }
  } finally {
    clearTimeout(timer)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function accepted(json: unknown): boolean {
  if (!Array.isArray(json) || json.length === 0) return false
  const first = json[0]
  if (!isRecord(first) || first.message_id == null) return false
  return !['failed', 'refunded'].includes(String(first.status ?? '').toLowerCase())
}

export async function sendSemaphoreOtp(
  config: SemaphoreConfig,
  message: { phone: string; code: string; template: string },
  options: CallOptions = {},
): Promise<SemaphoreSendResult> {
  if (
    !isSemaphoreApiKey(config.apiKey) ||
    !/^\+639[0-9]{9}$/.test(message.phone) ||
    !/^[0-9]{6}$/.test(message.code) ||
    message.template.split(OTP_PLACEHOLDER).length !== 2
  ) {
    return { ok: false, reason: 'rejected' }
  }
  const body = new URLSearchParams({
    apikey: config.apiKey,
    number: message.phone.slice(1),
    message: message.template,
    code: message.code,
  })
  if (config.senderName && isSemaphoreSenderName(config.senderName)) body.set('sendername', config.senderName)
  try {
    const { status, json } = await call(`${API}/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, options)
    return status >= 200 && status < 300 && accepted(json) ? { ok: true } : { ok: false, reason: 'rejected' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

/** Free account lookup, used to refuse a mistyped key at save time. */
export async function verifySemaphoreKey(apiKey: string, options: CallOptions = {}): Promise<SemaphoreKeyCheck> {
  if (!isSemaphoreApiKey(apiKey)) return { ok: false, reason: 'invalid_key' }
  try {
    const { status, json } = await call(`${API}/account?apikey=${encodeURIComponent(apiKey)}`, { method: 'GET' }, options)
    if (status >= 500) return { ok: false, reason: 'unreachable' }
    if (status >= 200 && status < 300 && isRecord(json) && json.account_id != null) return { ok: true }
    return { ok: false, reason: 'invalid_key' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}
