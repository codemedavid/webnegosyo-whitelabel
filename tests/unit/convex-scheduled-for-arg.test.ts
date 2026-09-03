import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  convexScheduledForArg,
  CONVEX_SCHEDULED_FOR_MIN_VERSION,
} from '@/lib/advance-order-utils'

/**
 * The web→Convex order path carried the advance-order time only inside
 * `customerData` under a comment claiming Convex "has no scheduled_for
 * column". The column and the `scheduledFor` mutation arg have existed since
 * schema v9 — the mobile checkout already sends it — so web-created pre-orders
 * were the one kind whose top-level field stayed empty, leaving reads to lean
 * on the customerData fallback forever.
 *
 * The catch is stale deployments: Convex rejects unknown mutation args, so
 * sending `scheduledFor` to a pre-v9 tenant would fail the entire checkout.
 * The helper gates on the tenant's recorded schema version, failing toward
 * omission — the customerData copy still rides along either way.
 */
describe('convexScheduledForArg', () => {
  const ISO = '2026-06-18T09:30:00.000Z'

  it('sends the top-level arg to a deployment that understands it', () => {
    expect(convexScheduledForArg(ISO, CONVEX_SCHEDULED_FOR_MIN_VERSION)).toEqual({
      scheduledFor: ISO,
    })
    expect(convexScheduledForArg(ISO, 22)).toEqual({ scheduledFor: ISO })
  })

  it('omits the arg for pre-v9 and unknown deployments — never fail a checkout over it', () => {
    expect(convexScheduledForArg(ISO, CONVEX_SCHEDULED_FOR_MIN_VERSION - 1)).toEqual({})
    expect(convexScheduledForArg(ISO, null)).toEqual({})
    expect(convexScheduledForArg(ISO, undefined)).toEqual({})
  })

  it('omits the arg for ASAP orders', () => {
    expect(convexScheduledForArg(undefined, 22)).toEqual({})
    expect(convexScheduledForArg(null, 22)).toEqual({})
  })

  it('pins the version the mutation arg shipped in', () => {
    expect(CONVEX_SCHEDULED_FOR_MIN_VERSION).toBe(9)
  })
})

describe('orders-service wiring', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'src', 'lib', 'orders-service.ts'),
    'utf8'
  )

  it('spreads the gated arg into the Convex mutation args', () => {
    expect(source).toMatch(/convexScheduledForArg/)
  })

  it('reads the schema version alongside the operating hours it already loads', () => {
    expect(source).toMatch(/convex_schema_version/)
  })
})
