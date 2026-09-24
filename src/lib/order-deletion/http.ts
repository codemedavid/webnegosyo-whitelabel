/**
 * Responses for the order-deletion routes. A refusal the owner can act on is
 * returned in plain words; anything unexpected is logged here and returned as
 * a generic failure, so database detail never reaches the client.
 */
import { NextResponse } from 'next/server'
import { OrderDeletionError, type OrderDeletionErrorCode } from './service'

const STATUS_BY_CODE: Record<OrderDeletionErrorCode, number> = {
  nothing_to_delete: 422,
  too_many_orders: 422,
  confirmation_mismatch: 422,
  wrong_password: 403,
  too_many_attempts: 429,
  not_found: 404,
  export_used: 409,
  export_expired: 409,
  recovery_closed: 409,
  not_restorable: 409,
}

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof OrderDeletionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: STATUS_BY_CODE[error.code], headers: NO_STORE }
    )
  }
  console.error(`[order-deletion] ${context} failed:`, error instanceof Error ? error.message : error)
  return NextResponse.json(
    { error: 'Something went wrong. Refresh to see the current state before trying again.' },
    { status: 500, headers: NO_STORE }
  )
}

/** The request body as an object, or null when it is not JSON. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
