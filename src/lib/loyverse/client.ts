/**
 * Loyverse REST API client (https://developer.loyverse.com).
 *
 * Plain module (not 'use server') so the request/retry/pagination logic is
 * unit testable with an injected fetch. It must only ever be imported from
 * server code — the access token is a tenant secret. Server actions and API
 * routes wrap it; nothing under components/ may import it.
 *
 * API constraints encoded here:
 * - Bearer auth, base https://api.loyverse.com/v1.0
 * - Rate limit 300 req / 300 s per merchant account → retry 429 (honouring
 *   Retry-After) and, for idempotent methods only, 5xx/network failures
 * - Every call is time-bounded (DEFAULT_REQUEST_TIMEOUT_MS)
 * - Cursor pagination (`cursor` query param, absent = last page, limit ≤ 250)
 * - Error envelope { errors: [{ code, details, field }] }
 * - 402 = the merchant's Loyverse subscription lapsed (surface, don't retry)
 */

export const LOYVERSE_API_BASE = 'https://api.loyverse.com/v1.0'

const DEFAULT_MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000
/** Longest server-requested (Retry-After) wait honoured before giving up the slot. */
const MAX_RETRY_AFTER_MS = 10_000
/**
 * Every call is bounded. Checkout awaits the live stock check and the
 * on-create receipt push, so an unbounded wait on a hung Loyverse API is a
 * hung checkout.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 250
/** Cursor-pagination backstop: 2,000 pages x 250 rows is far beyond any real catalog. */
const MAX_PAGES = 2_000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type SleepFn = (ms: number) => Promise<void>
type HttpMethod = 'GET' | 'POST' | 'DELETE'

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class LoyverseApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'LoyverseApiError'
    this.status = status
    this.code = code
    this.retryable = status === 429 || status >= 500
  }
}

interface LoyverseErrorBody {
  errors?: Array<{ code?: string; details?: string; field?: string }>
}

function errorFromResponse(status: number, body: LoyverseErrorBody | null): LoyverseApiError {
  const first = body?.errors?.[0]
  const code = first?.code ?? (status === 402 ? 'PAYMENT_REQUIRED' : `HTTP_${status}`)
  const message = first?.details ?? `Loyverse API request failed with status ${status}`
  return new LoyverseApiError(status, code, message)
}

/**
 * Whether a failed attempt may be sent again.
 *
 * POST is not idempotent: a 5xx or a dropped connection can arrive AFTER
 * Loyverse created the receipt, and a retry then books the same sale twice.
 * Only a 429 is safe to retry for POST — a rate-limited request was never
 * processed. GET/DELETE retry on 429, 5xx and network failures.
 */
function shouldRetry(method: HttpMethod, error: unknown): boolean {
  if (error instanceof LoyverseApiError) {
    if (method === 'POST') return error.status === 429
    // A timeout is a network failure for retry purposes (status 0 is not "retryable" by code).
    return error.retryable || error.code === 'TIMEOUT'
  }
  return method !== 'POST'
}

function retryDelayMs(attempt: number, response: Response | null): number {
  const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1)
  const header = response?.headers?.get?.('retry-after')
  const seconds = header ? Number(header) : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return backoff
  return Math.min(Math.max(backoff, seconds * 1000), MAX_RETRY_AFTER_MS)
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new LoyverseApiError(0, 'TIMEOUT', `Loyverse did not answer within ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export type LoyverseQuery = Record<string, string | number | boolean | undefined>

export interface LoyverseCallOptions {
  maxAttempts?: number
  timeoutMs?: number
  fetchImpl?: FetchLike
  sleep?: SleepFn
}

export interface LoyverseRequestOptions extends LoyverseCallOptions {
  path: string
  method?: HttpMethod
  query?: LoyverseQuery
  body?: unknown
}

export async function loyverseRequest<T = unknown>(
  accessToken: string,
  options: LoyverseRequestOptions
): Promise<T> {
  const {
    path,
    method = 'GET',
    query,
    body,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options

  const url = new URL(`${LOYVERSE_API_BASE}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  for (let attempt = 1; ; attempt++) {
    let response: Response | null = null
    try {
      response = await fetchWithTimeout(fetchImpl, url, init, timeoutMs)
      if (response.ok) {
        // DELETE answers 204 with no body.
        if (response.status === 204) return undefined as T
        return (await response.json()) as T
      }
      const errorBody = (await response.json().catch(() => null)) as LoyverseErrorBody | null
      throw errorFromResponse(response.status, errorBody)
    } catch (error: unknown) {
      if (attempt >= maxAttempts || !shouldRetry(method, error)) throw error
      await sleep(retryDelayMs(attempt, response))
    }
  }
}

export interface LoyverseListOptions extends LoyverseCallOptions {
  query?: LoyverseQuery
}

/** Follows cursor pagination to exhaustion and returns the concatenated `key` arrays. */
export async function loyverseListAll<T = unknown>(
  accessToken: string,
  path: string,
  key: string,
  options: LoyverseListOptions = {}
): Promise<T[]> {
  const { query, ...callOptions } = options
  const collected: T[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await loyverseRequest<Record<string, unknown>>(accessToken, {
      ...callOptions,
      path,
      query: { limit: PAGE_SIZE, ...query, cursor },
    })
    const items = response[key]
    if (Array.isArray(items)) collected.push(...(items as T[]))

    cursor = typeof response.cursor === 'string' && response.cursor ? response.cursor : undefined
    // A repeated cursor would loop forever re-reading the same page.
    if (!cursor || seenCursors.has(cursor)) return collected
    seenCursors.add(cursor)
  }
  throw new LoyverseApiError(0, 'PAGINATION_LIMIT', `Loyverse ${path} exceeded ${MAX_PAGES} pages`)
}

export interface LoyverseMerchant {
  id: string
  business_name?: string
  currency?: string
  country?: string
}

export interface LoyverseStore {
  id: string
  name: string
  address?: string | null
}

export interface LoyversePaymentType {
  id: string
  name: string
  type?: string
}

export type LoyverseConnectionTest =
  | {
      success: true
      merchant: LoyverseMerchant
      stores: LoyverseStore[]
      paymentTypes: LoyversePaymentType[]
    }
  | { success: false; error: string }

/**
 * Validates a token by reading the merchant profile plus the stores and
 * payment types the superadmin form needs for its pickers. Never throws —
 * the caller renders the failure message directly.
 */
export async function testLoyverseConnection(
  accessToken: string,
  options: LoyverseCallOptions = {}
): Promise<LoyverseConnectionTest> {
  try {
    const [merchant, stores, paymentTypes] = await Promise.all([
      loyverseRequest<LoyverseMerchant>(accessToken, { path: '/merchant', ...options }),
      loyverseListAll<LoyverseStore>(accessToken, '/stores', 'stores', options),
      loyverseListAll<LoyversePaymentType>(accessToken, '/payment_types', 'payment_types', options),
    ])
    return { success: true, merchant, stores, paymentTypes }
  } catch (error: unknown) {
    if (error instanceof LoyverseApiError) {
      if (error.status === 401) {
        return { success: false, error: 'Loyverse rejected the access token (unauthorized). Check the token in Back Office → Integrations → Access tokens.' }
      }
      if (error.status === 402) {
        return { success: false, error: 'The Loyverse account subscription has lapsed (payment required).' }
      }
      return { success: false, error: `Loyverse API error ${error.status}: ${error.message}` }
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unable to reach the Loyverse API' }
  }
}
