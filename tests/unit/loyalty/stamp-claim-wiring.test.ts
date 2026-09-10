import { readFileSync } from 'fs'
import { join } from 'path'
import { decideLoyaltyGoLive } from '@/lib/loyalty/go-live'

/**
 * Source guardrails for the claim path.
 *
 * Every defect this covers was live: the claim window existed nowhere, a
 * Convex store's claim could never earn because nothing projected the order
 * into the ledger, and the card was hidden by `hasContact` the moment it was
 * claimed. None of these fail loudly — they just quietly show no stamps.
 */

const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

describe('the claim window reaches both order backends', () => {
  const source = read('src/lib/order-contact-service.ts')

  it('gives the Convex order its status to decide on', () => {
    const convexPath = source.slice(
      source.indexOf('async function updateInConvex'),
      source.indexOf('async function updateInSupabase'),
    )
    expect(convexPath).toMatch(/status: order\.status/)
  })

  it('reads and passes the status on the platform Supabase path', () => {
    const supabasePath = source.slice(source.indexOf('async function updateInSupabase'))
    expect(supabasePath).toMatch(/customer_contact, customer_name, status/)
    expect(supabasePath).toMatch(/status: existing\.status/)
  })

  it('carries a closed claim through the result type', () => {
    expect(source).toMatch(/'claim_closed'/)
  })
})

describe('a Convex claim can actually earn', () => {
  const source = read('src/lib/order-contact-service.ts')

  it('projects the order into the platform customer ledger under the new number', () => {
    // Loyalty reads `customer_external_orders` for a Convex store, and a
    // walk-in order never wrote a row there — so without this the stamp was
    // impossible, not merely late.
    expect(source).toMatch(/captureExternalOrderBestEffort/)
    expect(source).toMatch(/backend: 'convex'/)
  })

  it('runs earning against the convex backend, not the platform one', () => {
    expect(source).toMatch(/runLoyaltyAfterAttach\(admin, submission, 'convex'\)/)
  })
})

describe('the contact route answers a closed window distinctly', () => {
  const source = read('src/app/api/orders/contact/route.ts')

  it('maps claim_closed to 410 Gone, not a generic failure', () => {
    expect(source).toMatch(/claim_closed'\s*\?\s*410/)
  })
})

describe('the tracking page paints the card from the live read', () => {
  const source = read('src/app/[tenant]/order/[orderId]/order-tracking-client.tsx')

  it('decides the card by view, not by hasContact alone', () => {
    // The old gate (`trackingData.hasContact === false`) unmounted the card a
    // few seconds after a successful claim, taking the new stamps with it.
    expect(source).toMatch(/decideStampCardView/)
    expect(source).not.toMatch(/trackingData\.hasContact === false &&/)
  })

  it('re-reads the stamps when the order status changes', () => {
    expect(source).toMatch(/useOrderStamps\(/)
    expect(source).toMatch(/status: trackingData\.status/)
  })

  it('re-reads after a claim instead of trusting only the claim reply', () => {
    expect(source).toMatch(/onClaimed=\{refreshStamps\}/)
  })
})

describe('activating a program switches the store live', () => {
  it('writes only what is missing', () => {
    expect(decideLoyaltyGoLive({ isEnabled: false, isShadow: true })).toEqual({
      loyalty_enabled: true,
      loyalty_shadow: false,
    })
    expect(decideLoyaltyGoLive({ isEnabled: true, isShadow: true })).toEqual({ loyalty_shadow: false })
    expect(decideLoyaltyGoLive({ isEnabled: false, isShadow: false })).toEqual({ loyalty_enabled: true })
  })

  it('writes nothing when the store is already live', () => {
    expect(decideLoyaltyGoLive({ isEnabled: true, isShadow: false })).toBeNull()
  })

  it('is wired into the activation branch of the programs route', () => {
    const source = read('src/app/api/loyalty/programs/route.ts')
    expect(source).toMatch(/patch\.status === 'active' \? await goLive\(admin, tenantId\)/)
    expect(source).toMatch(/decideLoyaltyGoLive/)
  })

  it('never switches a store back off, so replays stay idempotent', () => {
    const source = read('src/app/api/loyalty/programs/route.ts')
    expect(source).not.toMatch(/loyalty_enabled: false/)
  })
})
