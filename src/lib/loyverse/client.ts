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
 * - Rate limit 300 req / 300 s per merchant account → retry 429/5xx with
 *   backoff, never retry other 4xx
 * - Cursor pagination (`cursor` query param, absent = last page, limit ≤ 250)
 * - Error envelope { errors: [{ code, details, field }] }
 * - 402 = the merchant's Loyverse subscription lapsed (surface, don't retry)
 */

export const LOYVERSE_API_BASE = 'https://api.loyverse.com/v1.0'

const DEFAULT_MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type SleepFn = (ms: number) => Promise<void>

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

export type LoyverseQuery = Record<string, string | number | boolean | undefined>

export interface LoyverseRequestOptions {
  path: string
  method?: 'GET' | 'POST' | 'DELETE'
  query?: LoyverseQuery
  body?: unknown
  maxAttempts?: number
  fetchImpl?: FetchLike
  sleep?: SleepFn
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
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options

  const url = new URL(`${LOYVERSE_API_BASE}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let lastError: LoyverseApiError | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchImpl(url, init)
    if (response.ok) {
      return (await response.json()) as T
    }

    const errorBody = (await response.json().catch(() => null)) as LoyverseErrorBody | null
    lastError = errorFromResponse(response.status, errorBody)
    if (!lastError.retryable || attempt === maxAttempts) throw lastError
    await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1))
  }

  // Unreachable: the loop always returns or throws, but TypeScript can't see it.
  throw lastError ?? new LoyverseApiError(0, 'UNKNOWN', 'Loyverse request failed')
}

export interface LoyverseListOptions {
  query?: LoyverseQuery
  fetchImpl?: FetchLike
  sleep?: SleepFn
}

/** Follows cursor pagination to exhaustion and returns the concatenated `key` arrays. */
export async function loyverseListAll<T = unknown>(
  accessToken: string,
  path: string,
  key: string,
  options: LoyverseListOptions = {}
): Promise<T[]> {
  const collected: T[] = []
  let cursor: string | undefined

  do {
    const page = await loyverseRequest<Record<string, unknown>>(accessToken, {
      path,
      query: { limit: 250, ...options.query, cursor },
      fetchImpl: options.fetchImpl,
      sleep: options.sleep,
    })
    const items = page[key]
    if (Array.isArray(items)) collected.push(...(items as T[]))
    cursor = typeof page.cursor === 'string' && page.cursor ? page.cursor : undefined
  } while (cursor)

  return collected
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
  options: { fetchImpl?: FetchLike; sleep?: SleepFn } = {}
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
