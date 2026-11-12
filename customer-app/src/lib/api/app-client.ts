import type { z } from 'zod'
import { APP_ERROR_CODES, appErrorSchema, type AppErrorCode, type AppFieldError } from '@/lib/contract'

/**
 * The app's only door to the platform: `/api/app/v1/*` with the build's native
 * application id, every answer parsed through the shared contract. A payload
 * that fails the contract is an error, never something a screen renders.
 */

const TIMEOUT_MS = 15_000
const UNREACHABLE = 'We could not reach the store. Check your connection and try again.'
const UNEXPECTED = 'Something went wrong on our side. Please try again.'

export class AppApiError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    /** The store's unanswered checkout questions, by question name (order refusals only). */
    readonly fieldErrors: readonly AppFieldError[] = [],
  ) {
    super(message)
    this.name = 'AppApiError'
  }
}

interface FetchResponse {
  status: number
  ok: boolean
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>

interface AppClientOptions {
  baseUrl: string
  applicationId: string
  fetch?: FetchLike
}

export type SendMethod = 'POST' | 'PATCH' | 'DELETE'

interface SendOptions {
  body?: unknown
  /** The customer's session (`cs1.…`), sent as a bearer token. */
  token?: string | null
  /** Extra request headers (e.g. `Idempotency-Key`). The client's own headers always win. */
  headers?: Readonly<Record<string, string>>
}

interface GetOptions {
  token?: string | null
  headers?: Readonly<Record<string, string>>
}

export interface AppClient {
  /** A cacheable read (ETag/304), optionally as the signed-in customer. */
  get<S extends z.ZodType>(path: string, schema: S, options?: GetOptions): Promise<z.infer<S>>
  /** A write; never cached. */
  send<S extends z.ZodType>(method: SendMethod, path: string, schema: S, options?: SendOptions): Promise<z.infer<S>>
}

interface Envelope {
  success?: unknown
  data?: unknown
  error?: { code?: unknown; message?: unknown; fieldErrors?: unknown } | null
}

/** Headers only the client sets: a caller's copy is dropped, whatever its case. */
const RESERVED_HEADERS = new Set(['accept', 'authorization', 'content-type', 'if-none-match', 'x-app-id'])

const extraHeaders = (extra: Readonly<Record<string, string>> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(extra ?? {}).filter(([name]) => !RESERVED_HEADERS.has(name.toLowerCase())))

const isErrorCode = (value: unknown): value is AppErrorCode =>
  typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value)

function errorFrom(body: unknown): AppApiError {
  const error = (body as Envelope | null)?.error
  const code = isErrorCode(error?.code) ? error.code : 'internal'
  const message = typeof error?.message === 'string' && error.message ? error.message : UNEXPECTED
  const fieldErrors = appErrorSchema.shape.fieldErrors.safeParse(error?.fieldErrors)
  return new AppApiError(code, message, fieldErrors.success ? (fieldErrors.data ?? []) : [])
}

export function createAppClient({ baseUrl, applicationId, fetch: fetchImpl = fetch as unknown as FetchLike }: AppClientOptions): AppClient {
  const root = baseUrl.replace(/\/+$/, '')
  // Last good body per path, so a 304 costs no download and no re-parse.
  const cache = new Map<string, { etag: string; data: unknown }>()

  async function request(method: string, path: string, options: SendOptions & { etag?: string }): Promise<FetchResponse> {
    const headers: Record<string, string> = { ...extraHeaders(options.headers), Accept: 'application/json', 'X-App-Id': applicationId }
    if (options.etag) headers['If-None-Match'] = options.etag
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null
    try {
      return await fetchImpl(`${root}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller?.signal,
      })
    } catch {
      throw new AppApiError('unavailable', UNREACHABLE)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async function parse<S extends z.ZodType>(response: FetchResponse, schema: S): Promise<z.infer<S>> {
    const body = await response.json().catch(() => null)
    const envelope = body as Envelope | null
    if (!response.ok || envelope?.success !== true) throw errorFrom(body)
    const parsed = schema.safeParse(envelope.data)
    if (!parsed.success) throw new AppApiError('internal', UNEXPECTED)
    return parsed.data as z.infer<S>
  }

  return {
    async get<S extends z.ZodType>(path: string, schema: S, options: GetOptions = {}): Promise<z.infer<S>> {
      // Signed-in reads are per customer: never share the cached copy across sessions.
      const cacheKey = options.token ? null : path
      const cached = cacheKey ? cache.get(cacheKey) : undefined
      const response = await request('GET', path, { token: options.token, headers: options.headers, etag: cached?.etag })
      if (response.status === 304 && cached) return cached.data as z.infer<S>
      const data = await parse(response, schema)
      const etag = response.headers.get('etag')
      if (cacheKey && etag) cache.set(cacheKey, { etag, data })
      return data
    },
    async send<S extends z.ZodType>(method: SendMethod, path: string, schema: S, options: SendOptions = {}): Promise<z.infer<S>> {
      return parse(await request(method, path, options), schema)
    },
  }
}
