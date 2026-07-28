import { describe, it, expect } from '@jest/globals'
import {
  EMPTY_OUTLET_DRAFT,
  buildOutletWriteInput,
  outletToDraft,
  previewOutletSlug,
  moveOutletOrder,
  type OutletDraft,
} from '@/lib/outlets/outlet-form'
import { OutletValidationError } from '@/lib/outlets/outlet-repository'
import type { Outlet } from '@/types/database'

/**
 * The admin form is where a merchant's typing becomes an outlet row. Everything
 * here is string-in / typed-out, which is exactly where a blank field can turn
 * into a real zero — the failure mode that would silently park a branch at
 * latitude 0 in the Gulf of Guinea and make nearest-branch detection look broken.
 */

const draft = (overrides: Partial<OutletDraft> = {}): OutletDraft => ({
  ...EMPTY_OUTLET_DRAFT,
  name: 'BGC High Street',
  slug: 'bgc',
  ...overrides,
})

const storedOutlet = (overrides: Partial<Outlet> = {}): Outlet => ({
  id: 'outlet-1',
  tenant_id: 'tenant-1',
  name: 'BGC High Street',
  slug: 'bgc',
  address: '9th Ave, Taguig',
  latitude: 14.5507,
  longitude: 121.047,
  phone: '+639171234567',
  operating_hours: null,
  timezone: 'Asia/Manila',
  supports_pickup: true,
  supports_delivery: true,
  delivery_radius_km: 5,
  is_active: true,
  sort_order: 2,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
})

describe('EMPTY_OUTLET_DRAFT', () => {
  it('starts a new branch as active', () => {
    expect(EMPTY_OUTLET_DRAFT.is_active).toBe(true)
  })

  it('starts a new branch supporting both fulfillment modes', () => {
    // Neither-selected is rejected downstream; defaulting to both means the
    // merchant only ever has to turn things off, never discover a blocked save.
    expect(EMPTY_OUTLET_DRAFT.supports_pickup).toBe(true)
    expect(EMPTY_OUTLET_DRAFT.supports_delivery).toBe(true)
  })

  it('starts every text field blank rather than undefined', () => {
    expect(EMPTY_OUTLET_DRAFT.name).toBe('')
    expect(EMPTY_OUTLET_DRAFT.slug).toBe('')
    expect(EMPTY_OUTLET_DRAFT.latitude).toBe('')
    expect(EMPTY_OUTLET_DRAFT.longitude).toBe('')
  })
})

describe('previewOutletSlug', () => {
  it('derives a slug from the name while the slug field is untouched', () => {
    expect(previewOutletSlug(draft({ name: 'BGC High Street', slug: '' }))).toBe('bgc-high-street')
  })

  it('prefers whatever the merchant typed into the slug field', () => {
    expect(previewOutletSlug(draft({ name: 'BGC High Street', slug: 'bgc' }))).toBe('bgc')
  })

  it('normalizes a typed slug the same way it normalizes a derived one', () => {
    expect(previewOutletSlug(draft({ slug: '  BGC Main  ' }))).toBe('bgc-main')
  })

  it('returns an empty string when there is nothing to derive from yet', () => {
    expect(previewOutletSlug(draft({ name: '', slug: '' }))).toBe('')
  })
})

describe('buildOutletWriteInput', () => {
  it('trims the branch name', () => {
    expect(buildOutletWriteInput(draft({ name: '  BGC  ' })).name).toBe('BGC')
  })

  it('falls back to a name-derived slug when the merchant left slug blank', () => {
    expect(buildOutletWriteInput(draft({ name: 'Alabang Town', slug: '' })).slug).toBe(
      'alabang-town'
    )
  })

  it('rejects a blank name', () => {
    expect(() => buildOutletWriteInput(draft({ name: '   ' }))).toThrow(OutletValidationError)
  })

  it('rejects a reserved slug before it can ever reach the router', () => {
    expect(() => buildOutletWriteInput(draft({ slug: 'checkout' }))).toThrow(/reserved/i)
  })

  it('turns a blank address into null rather than an empty string', () => {
    expect(buildOutletWriteInput(draft({ address: '   ' })).address).toBeNull()
  })

  it('turns a blank phone into null', () => {
    expect(buildOutletWriteInput(draft({ phone: '' })).phone).toBeNull()
  })

  it('turns a blank timezone into null', () => {
    expect(buildOutletWriteInput(draft({ timezone: '' })).timezone).toBeNull()
  })

  it('parses coordinates the merchant typed', () => {
    const input = buildOutletWriteInput(draft({ latitude: '14.5507', longitude: '121.047' }))
    expect(input.latitude).toBeCloseTo(14.5507)
    expect(input.longitude).toBeCloseTo(121.047)
  })

  it('treats blank coordinates as absent, never as zero', () => {
    // A silent 0/0 is the whole point of this test: it is a valid latitude, so
    // nothing downstream would reject it, and the branch would rank as being
    // off the coast of Africa.
    const input = buildOutletWriteInput(draft({ latitude: '', longitude: '' }))
    expect(input.latitude).toBeNull()
    expect(input.longitude).toBeNull()
  })

  it('rejects a coordinate that is not a number instead of defaulting it', () => {
    expect(() => buildOutletWriteInput(draft({ latitude: 'north', longitude: '121' }))).toThrow(
      /latitude/i
    )
  })

  it('rejects an out-of-range coordinate', () => {
    expect(() => buildOutletWriteInput(draft({ latitude: '99', longitude: '121' }))).toThrow(
      /latitude/i
    )
  })

  it('rejects half a coordinate pair', () => {
    expect(() => buildOutletWriteInput(draft({ latitude: '14.55', longitude: '' }))).toThrow(
      /both latitude and longitude/i
    )
  })

  it('treats a blank delivery radius as unrestricted', () => {
    expect(buildOutletWriteInput(draft({ delivery_radius_km: '' })).delivery_radius_km).toBeNull()
  })

  it('parses a delivery radius', () => {
    expect(buildOutletWriteInput(draft({ delivery_radius_km: '7.5' })).delivery_radius_km).toBe(7.5)
  })

  it('rejects a delivery radius that is not a number', () => {
    expect(() => buildOutletWriteInput(draft({ delivery_radius_km: 'far' }))).toThrow(/radius/i)
  })

  it('rejects a negative delivery radius', () => {
    expect(() => buildOutletWriteInput(draft({ delivery_radius_km: '-2' }))).toThrow(/radius/i)
  })

  it('rejects a branch that supports neither pickup nor delivery', () => {
    expect(() =>
      buildOutletWriteInput(draft({ supports_pickup: false, supports_delivery: false }))
    ).toThrow(/pickup or delivery/i)
  })

  it('carries operating hours through untouched', () => {
    const hours = { '1': { closed: false, open: '09:00', close: '21:00' } }
    expect(buildOutletWriteInput(draft({ operating_hours: hours })).operating_hours).toEqual(hours)
  })

  it('defaults sort_order to zero for a brand new branch', () => {
    expect(buildOutletWriteInput(draft()).sort_order).toBe(0)
  })

  it('keeps the sort_order it was given', () => {
    expect(buildOutletWriteInput(draft(), { sortOrder: 4 }).sort_order).toBe(4)
  })

  it('does not mutate the draft it was handed', () => {
    const original = draft({ name: '  BGC  ' })
    const snapshot = { ...original }
    buildOutletWriteInput(original)
    expect(original).toEqual(snapshot)
  })
})

describe('outletToDraft', () => {
  it('round-trips a stored outlet back through the form unchanged', () => {
    const outlet = storedOutlet()
    const rebuilt = buildOutletWriteInput(outletToDraft(outlet), { sortOrder: outlet.sort_order })

    expect(rebuilt).toEqual({
      name: outlet.name,
      slug: outlet.slug,
      address: outlet.address,
      latitude: outlet.latitude,
      longitude: outlet.longitude,
      phone: outlet.phone,
      operating_hours: outlet.operating_hours,
      timezone: outlet.timezone,
      supports_pickup: outlet.supports_pickup,
      supports_delivery: outlet.supports_delivery,
      delivery_radius_km: outlet.delivery_radius_km,
      is_active: outlet.is_active,
      sort_order: outlet.sort_order,
    })
  })

  it('renders absent optional fields as blank inputs, not the string "null"', () => {
    const editing = outletToDraft(
      storedOutlet({
        address: null,
        phone: null,
        timezone: null,
        latitude: null,
        longitude: null,
        delivery_radius_km: null,
      })
    )

    expect(editing.address).toBe('')
    expect(editing.phone).toBe('')
    expect(editing.timezone).toBe('')
    expect(editing.latitude).toBe('')
    expect(editing.longitude).toBe('')
    expect(editing.delivery_radius_km).toBe('')
  })

  it('preserves operating hours it has no editor for yet', () => {
    // Phase 2 ships no per-branch hours UI. Dropping the field on save would
    // silently erase data the schema already supports.
    const hours = { '0': { closed: true, open: '00:00', close: '00:00' } }
    expect(outletToDraft(storedOutlet({ operating_hours: hours })).operating_hours).toEqual(hours)
  })
})

describe('moveOutletOrder', () => {
  const ids = ['a', 'b', 'c']

  it('moves an outlet up one position', () => {
    expect(moveOutletOrder(ids, 'b', 'up')).toEqual(['b', 'a', 'c'])
  })

  it('moves an outlet down one position', () => {
    expect(moveOutletOrder(ids, 'b', 'down')).toEqual(['a', 'c', 'b'])
  })

  it('leaves the first outlet alone when moved up', () => {
    expect(moveOutletOrder(ids, 'a', 'up')).toEqual(ids)
  })

  it('leaves the last outlet alone when moved down', () => {
    expect(moveOutletOrder(ids, 'c', 'down')).toEqual(ids)
  })

  it('ignores an id that is not in the list', () => {
    expect(moveOutletOrder(ids, 'zzz', 'up')).toEqual(ids)
  })

  it('returns a new array rather than reordering the caller’s', () => {
    const input = [...ids]
    const result = moveOutletOrder(input, 'b', 'up')
    expect(input).toEqual(ids)
    expect(result).not.toBe(input)
  })

  it('handles a single-outlet list', () => {
    expect(moveOutletOrder(['only'], 'only', 'down')).toEqual(['only'])
  })
})
