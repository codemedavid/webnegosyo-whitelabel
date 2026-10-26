import type { z } from 'zod'
import { APP_ERROR_CODES, type AppErrorCode } from '@/lib/contract'

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

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponse>

interface AppClientOptions {
  baseUrl: string
  applicationId: string
  fetch?: FetchLike
}

export interface AppClient {
  get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>>
}

interface Envelope {
  success?: unknown
  data?: unknown
  error?: { code?: unknown; message?: unknown } | null
}

const isErrorCode = (value: unknown): value is AppErrorCode =>
  typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value)

function errorFrom(body: unknown): AppApiError {
  const error = (body as Envelope | null)?.error
  const code = isErrorCode(error?.code) ? error.code : 'internal'
  const message = typeof error?.message === 'string' && error.message ? error.message : UNEXPECTED
  return new AppApiError(code, message)
}

export function createAppClient({ baseUrl, applicationId, fetch: fetchImpl = fetch as unknown as FetchLike }: AppClientOptions): AppClient {
  const root = baseUrl.replace(/\/+$/, '')
  // Last good body per path, so a 304 costs no download and no re-parse.
  const cache = new Map<string, { etag: string; data: unknown }>()

  async function request(path: string): Promise<FetchResponse> {
    const headers: Record<string, string> = { Accept: 'application/json', 'X-App-Id': applicationId }
    const cached = cache.get(path)
    if (cached) headers['If-None-Match'] = cached.etag
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null
    try {
      return await fetchImpl(`${root}${path}`, { method: 'GET', headers, signal: controller?.signal })
    } catch {
      throw new AppApiError('unavailable', UNREACHABLE)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return {
    async get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
      const response = await request(path)
      const cached = cache.get(path)
      if (response.status === 304 && cached) return cached.data as z.infer<S>
      const body = await response.json().catch(() => null)
      const envelope = body as Envelope | null
      if (!response.ok || envelope?.success !== true) throw errorFrom(body)
      const parsed = schema.safeParse(envelope.data)
      if (!parsed.success) throw new AppApiError('internal', UNEXPECTED)
      const etag = response.headers.get('etag')
      if (etag) cache.set(path, { etag, data: parsed.data })
      return parsed.data as z.infer<S>
    },
  }
}
