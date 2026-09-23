import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source guardrails for the seams where a prep-time promise can vanish without
 * an error — the places this codebase has actually lost fields before.
 */

const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

describe('order tracking service carries the prep promise', () => {
  const source = read('src/lib/order-tracking-service.ts')

  it('exposes the promised instant on TrackingData', () => {
    expect(source).toMatch(/promisedReadyAt\??:\s*string\s*\|\s*null/)
  })

  it('sends a server clock so a wrong device clock cannot skew the countdown', () => {
    expect(source).toMatch(/serverNowMs/)
  })

  it('reads the columns on the Supabase path from the order row itself', () => {
    // Folded into the order's own projection (it used to be a second read of
    // the same row on every poll). That is safe only because the order read
    // retries with `*` on an undefined-column error — pinned below and in
    // order-tracking-column-drift.test.ts — so an unmigrated column degrades
    // to a missing estimate, never a missing order.
    const projection = source.slice(
      source.indexOf('const ORDER_TRACKING_SELECT'),
      source.indexOf('const ORDER_TRACKING_FALLBACK_SELECT')
    )
    expect(projection).toMatch(/PREP_TIME_COLUMNS/)

    const columns = source.slice(source.indexOf('const PREP_TIME_COLUMNS'))
    expect(columns).toMatch(/^const PREP_TIME_COLUMNS = 'prep_minutes, promised_ready_at'/)

    const supabasePath = source.slice(source.indexOf('async function fetchFromSupabase'))
    expect(supabasePath).toMatch(/promised_ready_at/)
    expect(supabasePath).toMatch(/prep_minutes/)
  })

  it('reads the fields on the Convex path', () => {
    const convexPath = source.slice(
      source.indexOf('async function fetchFromConvex'),
      source.indexOf('async function fetchFromSupabase')
    )
    expect(convexPath).toMatch(/promisedReadyAt/)
  })

  it('survives a database that has not run the migration yet', () => {
    // Naming an unmigrated column in the select fails the WHOLE query, which
    // takes the customer's order page down rather than just the estimate. The
    // order read retries with `*` on SQLSTATE 42703.
    expect(source).toMatch(/const ORDER_TRACKING_FALLBACK_SELECT = `\*/)
    expect(source).toMatch(/isUndefinedColumnError\(attempt\.error\)/)
  })
})

describe('customer tracking page renders the promise', () => {
  const source = read('src/app/[tenant]/order/[orderId]/order-tracking-client.tsx')

  it('describes the promise through the shared pure module', () => {
    expect(source).toMatch(/describePrepPromise/)
    expect(source).toMatch(/from '@\/lib\/prep-time'/)
  })

  it('derives the countdown from the server clock, not the device clock', () => {
    expect(source).toMatch(/serverNowMs/)
  })
})
