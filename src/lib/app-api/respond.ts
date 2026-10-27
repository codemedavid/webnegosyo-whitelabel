import { NextResponse } from 'next/server'
import type { AppErrorCode } from '@/lib/app-contract'

/** Every /api/app/v1 answer is the contract's envelope; errors are never cached. */
const STATUS_FOR_CODE: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
}

export function appOk<T>(data: T, init: { headers?: Record<string, string>; status?: 200 | 201 | 202 } = {}): NextResponse {
  return NextResponse.json({ success: true, data, error: null }, { status: init.status ?? 200, headers: init.headers })
}

export function appFail(code: AppErrorCode, message: string, options: { retryAfterSec?: number } = {}): NextResponse {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (options.retryAfterSec !== undefined) headers['Retry-After'] = String(options.retryAfterSec)
  return NextResponse.json(
    { success: false, data: null, error: { code, message } },
    { status: STATUS_FOR_CODE[code], headers },
  )
}
