import { describe, it, expect } from '@jest/globals'
import {
  resolveOrderOutlet,
  withOrderOutlet,
  type OrderOutletCandidate,
} from '@/lib/outlets/order-outlet'

/**
 * Which branch an order belongs to, decided on the server.
 *
 * The customer's browser is the only thing that knows which branch they picked,
 * so the id arrives from the client — which means it is a claim, not a fact. The
 * server re-checks it against the tenant's own branches before writing it down.
 * Two things must never happen: an order recording a branch that belongs to
 * somebody else's restaurant, and an order recording a branch at all for a
 * tenant that never turned the feature on.
 *
 * Nothing here may throw. The order is the merchant's money; a branch we cannot
 * resolve is worth losing, an order is not.
 */

const BGC: OrderOutletCandidate = { id: 'outlet-bgc', name: 'Lucky Joy — BGC', is_active: true }
const MAKATI: OrderOutletCandidate = { id: 'outlet-makati', name: 'Lucky Joy — Makati', is_active: true }
const CLOSED: OrderOutletCandidate = { id: 'outlet-old', name: 'Lucky Joy — Cubao', is_active: false }

const resolve = (
  requestedOutletId: string | null | undefined,
  extra: { isEnabled?: boolean; outlets?: readonly OrderOutletCandidate[] } = {}
) =>
  resolveOrderOutlet({
    isEnabled: extra.isEnabled ?? true,
    requestedOutletId,
    outlets: extra.outlets ?? [BGC, MAKATI],
  })

describe('resolveOrderOutlet', () => {
  describe('when the tenant never enabled branches', () => {
    // The flag is the whole contract: with it off, an order must be recorded
    // exactly as it is today, even if a stale tab still sends a branch.
    it('records no branch even for an id that would otherwise resolve', () => {
      expect(resolve(BGC.id, { isEnabled: false })).toBeNull()
    })
  })

  describe('with nothing to resolve', () => {
    it('records no branch when the client sent none', () => {
      expect(resolve(undefined)).toBeNull()
    })

    it('records no branch for an explicit null', () => {
      expect(resolve(null)).toBeNull()
    })

    it('records no branch for an empty id', () => {
      expect(resolve('')).toBeNull()
    })

    it('records no branch for a whitespace-only id', () => {
      expect(resolve('   ')).toBeNull()
    })

    it('records no branch when the tenant has no branches at all', () => {
      expect(resolve(BGC.id, { outlets: [] })).toBeNull()
    })
  })

  describe('with a branch the tenant actually owns', () => {
    it('records the branch, carrying its name for the order record', () => {
      expect(resolve(BGC.id)).toEqual({ id: 'outlet-bgc', name: 'Lucky Joy — BGC' })
    })

    it('picks the branch the customer chose, not merely the first one', () => {
      expect(resolve(MAKATI.id)).toEqual({ id: 'outlet-makati', name: 'Lucky Joy — Makati' })
    })

    it('tolerates an id that arrived with surrounding whitespace', () => {
      expect(resolve(`  ${BGC.id}  `)).toEqual({ id: 'outlet-bgc', name: 'Lucky Joy — BGC' })
    })

    /**
     * A merchant can hide a branch while a customer is mid-checkout. Crediting
     * the order to the branch that actually took it beats recording nothing:
     * the sale really happened there, and the alternative silently loses it.
     * Re-prompting the customer is a separate concern from recording the truth.
     */
    it('still records a branch the merchant hid mid-checkout', () => {
      expect(resolve(CLOSED.id, { outlets: [BGC, CLOSED] })).toEqual({
        id: 'outlet-old',
        name: 'Lucky Joy — Cubao',
      })
    })
  })

  describe('with a branch the tenant does not own', () => {
    // The list handed in is already scoped to this tenant, so an id that is not
    // in it belongs to someone else — or to nobody. Either way it is not
    // written onto this merchant's order.
    it('refuses an id belonging to another restaurant', () => {
      expect(resolve('outlet-from-a-different-tenant')).toBeNull()
    })

    it('refuses a fabricated id', () => {
      expect(resolve('../../../etc/passwd')).toBeNull()
    })
  })
})

describe('withOrderOutlet', () => {
  const outlet = { id: 'outlet-bgc', name: 'Lucky Joy — BGC' }

  /**
   * Convex and tenant-owned Supabase projects run schemas this repo cannot
   * migrate on demand, so the branch travels inside customer_data — the same
   * carrier the advance-order schedule and payment proof already use.
   */
  it('stamps the branch onto the order payload', () => {
    expect(withOrderOutlet({ customer_name: 'Ana' }, outlet)).toEqual({
      customer_name: 'Ana',
      outlet_id: 'outlet-bgc',
      outlet_name: 'Lucky Joy — BGC',
    })
  })

  it('builds a payload when the order carried none', () => {
    expect(withOrderOutlet(undefined, outlet)).toEqual({
      outlet_id: 'outlet-bgc',
      outlet_name: 'Lucky Joy — BGC',
    })
  })

  it('leaves the payload it was handed untouched', () => {
    const original = { customer_name: 'Ana' }
    withOrderOutlet(original, outlet)
    expect(original).toEqual({ customer_name: 'Ana' })
  })

  /**
   * The whole regression guarantee in one assertion: with no branch resolved,
   * the payload that reaches the database is the very object it is today — not
   * a copy, not a copy with an `outlet_id: null` key that would show up in
   * every existing tenant's order records.
   */
  it('hands back the exact same payload when there is no branch', () => {
    const original = { customer_name: 'Ana' }
    expect(withOrderOutlet(original, null)).toBe(original)
  })

  it('leaves an absent payload absent when there is no branch', () => {
    expect(withOrderOutlet(undefined, null)).toBeUndefined()
  })

  it('overwrites a branch the client tried to claim for itself', () => {
    expect(
      withOrderOutlet({ outlet_id: 'outlet-someone-elses', outlet_name: 'Spoofed' }, outlet)
    ).toEqual({ outlet_id: 'outlet-bgc', outlet_name: 'Lucky Joy — BGC' })
  })
})
