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

  it('reads the columns on the Supabase path', () => {
    // The Supabase branch selects an explicit column list.
    const supabasePath = source.slice(source.indexOf('async function fetchFromSupabase'))
    expect(supabasePath).toMatch(/prep_minutes/)
    expect(supabasePath).toMatch(/promised_ready_at/)
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
    // file already carries this defence for pickup_scan_enabled.
    expect(source).toMatch(/PREP_TIME_COLUMNS|prepTimeColumns|retry|fallback/i)
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
