/**
 * Who may delete a store's orders, and what they must type to do it.
 *
 * Only the store's own owner. Not staff with every grant, not a branch admin,
 * and not a superadmin impersonating the store: deletion is the owner's
 * decision about the owner's records, and a support account acting on a
 * merchant's behalf is exactly the case the recovery window exists for.
 */
import {
  decideOwnerAccess,
  isPasswordAttemptAllowed,
  isSameOriginRequest,
  matchesConfirmationPhrase,
} from '@/lib/order-deletion/access'
import { MAX_PASSWORD_FAILURES } from '@/lib/order-deletion/constants'

const TENANT = 'tenant-1'

describe('decideOwnerAccess', () => {
  test('admits the owner of this store', () => {
    expect(
      decideOwnerAccess({ role: 'admin', tenant_id: TENANT, is_owner: true }, TENANT)
    ).toEqual({ allowed: true })
  })

  test("refuses the owner of a different store", () => {
    expect(
      decideOwnerAccess({ role: 'admin', tenant_id: 'tenant-2', is_owner: true }, TENANT)
    ).toEqual({ allowed: false, reason: 'wrong_store' })
  })

  test('refuses staff, even with full access', () => {
    expect(
      decideOwnerAccess({ role: 'admin', tenant_id: TENANT, is_owner: false }, TENANT)
    ).toEqual({ allowed: false, reason: 'not_owner' })
    expect(
      decideOwnerAccess({ role: 'admin', tenant_id: TENANT, is_owner: null }, TENANT)
    ).toEqual({ allowed: false, reason: 'not_owner' })
  })

  test('refuses a superadmin', () => {
    expect(
      decideOwnerAccess({ role: 'superadmin', tenant_id: null, is_owner: false }, TENANT)
    ).toEqual({ allowed: false, reason: 'not_owner' })
  })

  test('refuses a caller with no account row', () => {
    expect(decideOwnerAccess(null, TENANT)).toEqual({ allowed: false, reason: 'no_account' })
  })

  test('refuses a blank tenant id rather than matching a null one', () => {
    expect(
      decideOwnerAccess({ role: 'admin', tenant_id: null, is_owner: true }, '')
    ).toEqual({ allowed: false, reason: 'wrong_store' })
  })
})

describe('matchesConfirmationPhrase', () => {
  test('accepts the store name typed exactly', () => {
    expect(matchesConfirmationPhrase("Aling Nena's Kitchen", "Aling Nena's Kitchen")).toBe(true)
  })

  test('forgives case and surrounding or doubled spaces', () => {
    expect(matchesConfirmationPhrase("  aling  nena's kitchen ", "Aling Nena's Kitchen")).toBe(true)
  })

  test('refuses anything else', () => {
    expect(matchesConfirmationPhrase('Aling Nena', "Aling Nena's Kitchen")).toBe(false)
    expect(matchesConfirmationPhrase('delete', "Aling Nena's Kitchen")).toBe(false)
  })

  test('refuses an empty phrase even against an empty store name', () => {
    expect(matchesConfirmationPhrase('', '')).toBe(false)
    expect(matchesConfirmationPhrase('   ', '  ')).toBe(false)
  })
})

describe('isPasswordAttemptAllowed', () => {
  test('allows attempts under the limit and stops at it', () => {
    expect(isPasswordAttemptAllowed(0)).toBe(true)
    expect(isPasswordAttemptAllowed(MAX_PASSWORD_FAILURES - 1)).toBe(true)
    expect(isPasswordAttemptAllowed(MAX_PASSWORD_FAILURES)).toBe(false)
  })
})

describe('isSameOriginRequest', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries)

  test('accepts a browser request from the host it is sent to', () => {
    expect(
      isSameOriginRequest(headers({ origin: 'https://shop.webnegosyo.com', host: 'shop.webnegosyo.com' }))
    ).toBe(true)
  })

  test('ignores x-forwarded-host, which page script is allowed to set', () => {
    expect(
      isSameOriginRequest(
        headers({
          origin: 'https://evil.example',
          host: 'shop.webnegosyo.com',
          'x-forwarded-host': 'evil.example',
        })
      )
    ).toBe(false)
  })

  test('refuses when the browser itself reports a cross-site request', () => {
    expect(
      isSameOriginRequest(
        headers({
          origin: 'https://shop.webnegosyo.com',
          host: 'shop.webnegosyo.com',
          'sec-fetch-site': 'cross-site',
        })
      )
    ).toBe(false)
  })

  test('accepts a same-origin fetch the browser labels as such', () => {
    expect(
      isSameOriginRequest(
        headers({
          origin: 'https://shop.webnegosyo.com',
          host: 'shop.webnegosyo.com',
          'sec-fetch-site': 'same-origin',
        })
      )
    ).toBe(true)
  })

  test('refuses a cross-site request', () => {
    expect(
      isSameOriginRequest(headers({ origin: 'https://evil.example', host: 'shop.webnegosyo.com' }))
    ).toBe(false)
  })

  test('refuses a request with no origin, or a malformed one', () => {
    expect(isSameOriginRequest(headers({ host: 'shop.webnegosyo.com' }))).toBe(false)
    expect(isSameOriginRequest(headers({ origin: 'null', host: 'shop.webnegosyo.com' }))).toBe(false)
  })
})
