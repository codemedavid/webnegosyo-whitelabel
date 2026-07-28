import { describe, it, expect } from '@jest/globals'
import {
  OUTLET_SELECT,
  assertOutletInvariants,
  OutletValidationError,
} from '@/lib/outlets/outlet-repository'
import {
  EMPTY_OUTLET_DRAFT,
  buildOutletWriteInput,
  outletToDraft,
  type OutletDraft,
} from '@/lib/outlets/outlet-form'
import type { Outlet } from '@/types/database'

/**
 * The seam that has bitten this codebase repeatedly: a column exists, the form
 * writes it, and a SELECT projection somewhere never asks for it — so the value
 * saves and then reads back undefined. `supports_dine_in` decides whether a
 * whole tile appears on the storefront, so a dropped projection would present
 * as "dine-in silently does nothing" with nothing in the logs.
 */

function makeOutlet(overrides: Partial<Outlet> = {}): Outlet {
  return {
    id: 'o1',
    tenant_id: 't1',
    name: 'Makati',
    slug: 'makati',
    address: 'Ayala Ave',
    image_url: null,
    latitude: null,
    longitude: null,
    phone: null,
    operating_hours: null,
    timezone: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    delivery_radius_km: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function draftWith(overrides: Partial<OutletDraft>): OutletDraft {
  return { ...EMPTY_OUTLET_DRAFT, name: 'Makati', ...overrides }
}

describe('OUTLET_SELECT projection', () => {
  it('asks for supports_dine_in, or the storefront reads it back undefined', () => {
    expect(OUTLET_SELECT).toContain('supports_dine_in')
  })

  it('asks for image_url, or every branch card falls back to a placeholder', () => {
    expect(OUTLET_SELECT).toContain('image_url')
  })
})

describe('assertOutletInvariants — dine-in counts as fulfillment', () => {
  it('accepts a branch that only seats customers', () => {
    // Arrange / Act / Assert
    expect(() =>
      assertOutletInvariants({
        latitude: null,
        longitude: null,
        supports_pickup: false,
        supports_delivery: false,
        supports_dine_in: true,
      })
    ).not.toThrow()
  })

  it('still rejects a branch that offers no way to receive an order', () => {
    expect(() =>
      assertOutletInvariants({
        latitude: null,
        longitude: null,
        supports_pickup: false,
        supports_delivery: false,
        supports_dine_in: false,
      })
    ).toThrow(OutletValidationError)
  })

  it('treats an absent dine-in field as false rather than as permission', () => {
    // Callers predating dine-in must not accidentally pass validation.
    expect(() =>
      assertOutletInvariants({
        latitude: null,
        longitude: null,
        supports_pickup: false,
        supports_delivery: false,
      })
    ).toThrow(OutletValidationError)
  })

  it('names all three modes in the error a merchant reads', () => {
    try {
      assertOutletInvariants({
        latitude: null,
        longitude: null,
        supports_pickup: false,
        supports_delivery: false,
        supports_dine_in: false,
      })
      throw new Error('expected a validation error')
    } catch (error) {
      expect((error as Error).message).toMatch(/dine/i)
    }
  })
})

describe('buildOutletWriteInput — dine-in and photo', () => {
  it('carries the dine-in choice into the write', () => {
    const input = buildOutletWriteInput(draftWith({ supports_dine_in: true }))

    expect(input.supports_dine_in).toBe(true)
  })

  it('defaults a new branch to dine-in off, matching the column default', () => {
    expect(EMPTY_OUTLET_DRAFT.supports_dine_in).toBe(false)
  })

  it('saves a branch photo URL', () => {
    const input = buildOutletWriteInput(draftWith({ image_url: 'https://ik.example/branch.jpg' }))

    expect(input.image_url).toBe('https://ik.example/branch.jpg')
  })

  it('stores a blank photo field as null rather than an empty string', () => {
    // An empty string is a truthy-looking value that renders a broken <img>.
    const input = buildOutletWriteInput(draftWith({ image_url: '   ' }))

    expect(input.image_url).toBeNull()
  })

  it('accepts a dine-in-only branch through the form path', () => {
    expect(() =>
      buildOutletWriteInput(
        draftWith({ supports_pickup: false, supports_delivery: false, supports_dine_in: true })
      )
    ).not.toThrow()
  })
})

describe('outletToDraft', () => {
  it('round-trips dine-in support back into the edit dialog', () => {
    const draft = outletToDraft(makeOutlet({ supports_dine_in: true }))

    expect(draft.supports_dine_in).toBe(true)
  })

  it('round-trips the branch photo, blanking a null', () => {
    expect(outletToDraft(makeOutlet({ image_url: 'https://ik.example/a.jpg' })).image_url).toBe(
      'https://ik.example/a.jpg'
    )
    expect(outletToDraft(makeOutlet({ image_url: null })).image_url).toBe('')
  })
})
