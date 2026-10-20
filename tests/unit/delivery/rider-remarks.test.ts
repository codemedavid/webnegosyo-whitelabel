/** @jest-environment node */
import { findDeliveryDetails } from '@/lib/delivery/delivery-details'
import { buildRiderRemarks, RIDER_REMARKS_MAX_LENGTH } from '@/lib/delivery/rider-remarks'
import * as convexRemarks from '../../../convex-template/convex/lalamoveRemarks'

const IMPLEMENTATIONS = [
  { name: 'web', findDeliveryDetails, buildRiderRemarks },
  { name: 'convex', findDeliveryDetails: convexRemarks.findDeliveryDetails, buildRiderRemarks: convexRemarks.buildRiderRemarks },
]

describe.each(IMPLEMENTATIONS)('findDeliveryDetails ($name)', (impl) => {
  it('reads the built-in detail fields', () => {
    expect(
      impl.findDeliveryDetails({
        delivery_unit: ' Unit 5B ',
        delivery_landmark: 'Blue gate beside 7-Eleven',
        delivery_rider_note: 'Call on arrival',
      }),
    ).toEqual({ unit: 'Unit 5B', landmark: 'Blue gate beside 7-Eleven', riderNote: 'Call on arrival' })
  })

  it('finds merchant-named fields by their label', () => {
    expect(
      impl.findDeliveryDetails({
        'Nearest Landmark': 'Near Petron',
        'Note to Rider': 'Gate is green',
        'Floor / Unit': '3F',
      }),
    ).toEqual({ unit: '3F', landmark: 'Near Petron', riderNote: 'Gate is green' })
    expect(impl.findDeliveryDetails({ palatandaan: 'Tapat ng simbahan', Notes: 'Pakibusina' })).toEqual({
      unit: '',
      landmark: 'Tapat ng simbahan',
      riderNote: 'Pakibusina',
    })
  })

  it('prefers the built-in field over a merchant alias', () => {
    expect(impl.findDeliveryDetails({ delivery_landmark: 'Built-in', landmark: 'Alias' }).landmark).toBe('Built-in')
  })

  it('ignores the address, coordinates, non-strings and blank answers', () => {
    expect(
      impl.findDeliveryDetails({
        delivery_address: 'Unit 1, Mabini St',
        delivery_lat: '14.6',
        landmark: '   ',
        notes: 42,
      }),
    ).toEqual({ unit: '', landmark: '', riderNote: '' })
  })
})

describe.each(IMPLEMENTATIONS)('buildRiderRemarks ($name)', (impl) => {
  const full = {
    delivery_address: '12 Mabini St, Brgy. San Roque, Antipolo',
    delivery_lat: '14.5861',
    delivery_lng: '121.1761',
    delivery_unit: 'Unit 5B',
    delivery_landmark: 'Blue gate beside 7-Eleven',
    delivery_rider_note: 'Call on arrival',
  }

  it('lists unit, landmark, note, address and a pin link in that order', () => {
    expect(impl.buildRiderRemarks(full)).toBe(
      [
        'Unit/Floor: Unit 5B',
        'Landmark: Blue gate beside 7-Eleven',
        'Note: Call on arrival',
        'Address: 12 Mabini St, Brgy. San Roque, Antipolo',
        'Pin: https://www.google.com/maps/search/?api=1&query=14.5861,121.1761',
      ].join('\n'),
    )
  })

  it('reads the address from the field the caller names', () => {
    expect(impl.buildRiderRemarks({ 'Complete Address': 'Purok 3' }, 'Complete Address')).toBe('Address: Purok 3')
  })

  it('leaves out the pin when the coordinates are unusable', () => {
    expect(impl.buildRiderRemarks({ ...full, delivery_lat: 'abc' })).not.toContain('Pin:')
    expect(impl.buildRiderRemarks({ ...full, delivery_lat: '0', delivery_lng: '0' })).not.toContain('Pin:')
  })

  it('returns an empty string when there is nothing to say', () => {
    expect(impl.buildRiderRemarks({})).toBe('')
  })

  it('stays within the Lalamove limit, cutting the address before the pin or landmark', () => {
    const remarks = impl.buildRiderRemarks({
      ...full,
      delivery_address: 'A'.repeat(2000),
      delivery_rider_note: 'N'.repeat(600),
    })
    expect(remarks.length).toBeLessThanOrEqual(RIDER_REMARKS_MAX_LENGTH)
    expect(remarks).toContain('Landmark: Blue gate beside 7-Eleven')
    expect(remarks).toContain('Pin: https://www.google.com/maps/search/?api=1&query=14.5861,121.1761')
  })

  it('cuts the note too when the landmark and note alone overflow', () => {
    const remarks = impl.buildRiderRemarks({ ...full, delivery_rider_note: 'N'.repeat(3000) })
    expect(remarks.length).toBeLessThanOrEqual(RIDER_REMARKS_MAX_LENGTH)
    expect(remarks).toContain('Pin:')
  })
})
