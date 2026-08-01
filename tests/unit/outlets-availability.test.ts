import { describe, it, expect } from '@jest/globals'
import {
  resolveOutletAvailability,
  BRANCHES_UNAVAILABLE_MESSAGE,
} from '@/lib/outlets/outlet-availability'

/**
 * What a storefront does when it cannot load a merchant's branches.
 *
 * Phase 1 recorded this as Decision E: an outlet read failure must fail loudly,
 * because "degrading to no branches renders the single-outlet flow for a
 * multi-branch merchant and sends the order to the wrong kitchen".
 *
 * Phase 3 then made the failure silent — `menu-server.tsx` logs a warning and
 * falls back to an empty list — for an equally real reason: throwing there
 * blanks the entire menu, the regression commit 38b4ede had already fixed once
 * for the dish query.
 *
 * Both are right. The resolution is to separate the two questions: the menu
 * still renders, and ordering is what stops. This module owns that decision, so
 * it is a value both the server and the checkout can read rather than a `throw`
 * one of them has to catch.
 *
 * A tenant that never enabled branches must be entirely unaffected — it never
 * ran the query, so it can never be blocked by its failure.
 */

describe('resolveOutletAvailability — tenants without the feature', () => {
  it('lets a single-location tenant order', () => {
    const result = resolveOutletAvailability({ isEnabled: false, didLoadFail: false, outletCount: 0 })
    expect(result.canOrder).toBe(true)
    expect(result.state).toBe('ok')
    expect(result.message).toBeNull()
  })

  it('is unaffected by a failure flag it could not have produced', () => {
    // The query is only issued for a tenant that opted in, so this combination
    // should never occur — but a stale flag must not close a shop that never
    // had branches.
    const result = resolveOutletAvailability({ isEnabled: false, didLoadFail: true, outletCount: 0 })
    expect(result.canOrder).toBe(true)
    expect(result.state).toBe('ok')
  })
})

describe('resolveOutletAvailability — branches loaded', () => {
  it('lets customers order when the branches loaded', () => {
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: false, outletCount: 3 })
    expect(result.canOrder).toBe(true)
    expect(result.state).toBe('ok')
    expect(result.message).toBeNull()
  })

  it('lets customers order at a merchant with a single branch', () => {
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: false, outletCount: 1 })
    expect(result.canOrder).toBe(true)
  })

  it('still lets customers order when the merchant configured no branches yet', () => {
    // Flipping the flag on before creating any branch must not close the shop.
    // There is no wrong kitchen to send this order to — there is only one.
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: false, outletCount: 0 })
    expect(result.canOrder).toBe(true)
    expect(result.state).toBe('ok')
  })
})

describe('resolveOutletAvailability — branches could not be loaded', () => {
  it('stops ordering rather than guessing the branch', () => {
    // Decision E, enforced: the alternative is an order silently attributed to
    // no branch and cooked in the wrong kitchen.
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: true, outletCount: 0 })
    expect(result.canOrder).toBe(false)
    expect(result.state).toBe('branches_unavailable')
  })

  it('explains itself to the customer', () => {
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: true, outletCount: 0 })
    expect(result.message).toBe(BRANCHES_UNAVAILABLE_MESSAGE)
  })

  it('stops ordering even if a partial list came back', () => {
    // A partial list is worse than none: the customer picks from branches that
    // loaded and never sees the one they wanted.
    const result = resolveOutletAvailability({ isEnabled: true, didLoadFail: true, outletCount: 2 })
    expect(result.canOrder).toBe(false)
    expect(result.state).toBe('branches_unavailable')
  })

  it('says nothing about branches the customer cannot act on', () => {
    const message = resolveOutletAvailability({ isEnabled: true, didLoadFail: true, outletCount: 0 }).message
    expect(message).not.toMatch(/error|failed|exception|query/i)
  })
})

describe('resolveOutletAvailability — robustness', () => {
  it('treats a missing outlet count as no branches', () => {
    const result = resolveOutletAvailability({
      isEnabled: true,
      didLoadFail: false,
      outletCount: undefined as unknown as number,
    })
    expect(result.canOrder).toBe(true)
  })

  it('never throws on a fully undefined input', () => {
    expect(() =>
      resolveOutletAvailability(undefined as unknown as Parameters<typeof resolveOutletAvailability>[0])
    ).not.toThrow()
  })

  it('defaults an unknown input to letting the customer order', () => {
    // Failing open here matches every other guard in this feature: a tenant
    // without branches must never be blocked by branch logic.
    const result = resolveOutletAvailability(
      undefined as unknown as Parameters<typeof resolveOutletAvailability>[0]
    )
    expect(result.canOrder).toBe(true)
  })
})
