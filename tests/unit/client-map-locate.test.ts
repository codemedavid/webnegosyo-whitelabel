import {
  cleanAddressForGeocoding,
  pickAddressesToGeocode,
  resolveClientLocations,
  spreadCoincidentPins,
  summarizeClientMap,
  toLngLat,
  type ClientMapTenantRow,
  type ClientPin,
} from '@/lib/superadmin/client-map/locate'

function row(overrides: Partial<ClientMapTenantRow> = {}): ClientMapTenantRow {
  return {
    id: 't1',
    name: 'Kape Tayo',
    slug: 'kape-tayo',
    logo_url: 'https://ik.imagekit.io/x/logo.png',
    primary_color: '#ff6600',
    domain: null,
    created_at: '2026-01-10T00:00:00Z',
    restaurant_address: null,
    footer_address: null,
    restaurant_latitude: null,
    restaurant_longitude: null,
    ...overrides,
  }
}

function pin(overrides: Partial<ClientPin> = {}): ClientPin {
  return {
    id: 'p1',
    name: 'A',
    slug: 'a',
    logoUrl: null,
    color: '#ffffff',
    domain: null,
    createdAt: '2026-01-01T00:00:00Z',
    address: null,
    lng: 121,
    lat: 14.5,
    source: 'saved',
    branchCount: 0,
    ...overrides,
  }
}

describe('toLngLat', () => {
  it('coerces numeric strings that PostgREST returns for numeric columns', () => {
    expect(toLngLat('14.55', '121.02')).toEqual([121.02, 14.55])
  })

  it('rejects null island, missing and out-of-range values', () => {
    expect(toLngLat(0, 0)).toBeNull()
    expect(toLngLat(null, 121)).toBeNull()
    expect(toLngLat(95, 121)).toBeNull()
    expect(toLngLat(14, 200)).toBeNull()
    expect(toLngLat('abc', 121)).toBeNull()
  })
})

describe('cleanAddressForGeocoding', () => {
  it('collapses whitespace and repeated commas', () => {
    expect(cleanAddressForGeocoding('  Rizal St.,,  Pio Duran ,  Philippines ')).toBe(
      'Rizal St., Pio Duran, Philippines',
    )
  })

  it('drops trailing form junk like "Contact info"', () => {
    expect(cleanAddressForGeocoding('Imus Terminal Mall, Imus, Philippines Contact info')).toBe(
      'Imus Terminal Mall, Imus, Philippines',
    )
  })

  it('returns null for placeholders like N/A', () => {
    expect(cleanAddressForGeocoding('N/A')).toBeNull()
    expect(cleanAddressForGeocoding('none')).toBeNull()
    expect(cleanAddressForGeocoding('---')).toBeNull()
  })

  it('returns null for blank or too-short input', () => {
    expect(cleanAddressForGeocoding(null)).toBeNull()
    expect(cleanAddressForGeocoding('   ')).toBeNull()
    expect(cleanAddressForGeocoding('ab')).toBeNull()
  })
})

describe('pickAddressesToGeocode', () => {
  it('returns unique cleaned addresses only for tenants with no saved or branch location', () => {
    const rows = [
      row({ id: 'saved', restaurant_address: 'Makati', restaurant_latitude: 14.5, restaurant_longitude: 121 }),
      row({ id: 'branch', restaurant_address: 'Pasig City' }),
      row({ id: 'a', restaurant_address: 'Quezon City, Philippines' }),
      row({ id: 'b', restaurant_address: ' Quezon City,  Philippines' }),
      row({ id: 'none' }),
    ]
    const branches = [{ tenantId: 'branch', latitude: 14.57, longitude: 121.08 }]

    expect(pickAddressesToGeocode(rows, branches)).toEqual(['Quezon City, Philippines'])
  })

  it('is sorted so the cache key is stable across row order', () => {
    const rows = [row({ id: 'a', restaurant_address: 'Cebu City' }), row({ id: 'b', restaurant_address: 'Bacolod' })]
    expect(pickAddressesToGeocode(rows, [])).toEqual(['Bacolod', 'Cebu City'])
  })
})

describe('resolveClientLocations', () => {
  it('prefers saved coordinates, then a branch, then the geocoded address', () => {
    const rows = [
      row({ id: 'saved', restaurant_latitude: 10.3, restaurant_longitude: 123.9, restaurant_address: 'Cebu' }),
      row({ id: 'branch', restaurant_address: 'Pasig' }),
      row({ id: 'geo', restaurant_address: 'Davao City' }),
    ]
    const branches = [
      { tenantId: 'branch', latitude: 14.57, longitude: 121.08 },
      { tenantId: 'branch', latitude: 14.6, longitude: 121.1 },
    ]
    const geocoded = { 'Davao City': [125.6, 7.07] as [number, number] }

    const { pins, unmapped } = resolveClientLocations(rows, branches, geocoded)

    expect(unmapped).toEqual([])
    expect(pins.map((p) => [p.id, p.source, p.lng, p.lat])).toEqual([
      ['saved', 'saved', 123.9, 10.3],
      ['branch', 'branch', 121.08, 14.57],
      ['geo', 'address', 125.6, 7.07],
    ])
    expect(pins.find((p) => p.id === 'branch')?.branchCount).toBe(2)
  })

  it('falls back to the storefront footer address', () => {
    const rows = [row({ id: 'f', footer_address: 'Corporate Woods Ave, Alabang, Muntinlupa' })]
    expect(pickAddressesToGeocode(rows, [])).toEqual(['Corporate Woods Ave, Alabang, Muntinlupa'])

    const { pins } = resolveClientLocations(rows, [], {
      'Corporate Woods Ave, Alabang, Muntinlupa': [121.03, 14.42],
    })
    expect(pins[0]).toMatchObject({ source: 'address', address: 'Corporate Woods Ave, Alabang, Muntinlupa' })
  })

  it('lists tenants it cannot place with the reason', () => {
    const rows = [row({ id: 'blank' }), row({ id: 'lost', restaurant_address: 'sambapa' })]

    const { pins, unmapped } = resolveClientLocations(rows, [], {})

    expect(pins).toEqual([])
    expect(unmapped.map((u) => [u.id, u.reason])).toEqual([
      ['blank', 'no_address'],
      ['lost', 'address_not_found'],
    ])
  })

  it('falls back to a neutral colour when the brand colour is not a hex value', () => {
    const { pins } = resolveClientLocations(
      [row({ primary_color: 'red;background:url(x)', restaurant_latitude: 14, restaurant_longitude: 121 })],
      [],
      {},
    )
    expect(pins[0].color).toBe('#ffffff')
  })
})

describe('spreadCoincidentPins', () => {
  it('leaves distinct locations untouched', () => {
    const pins = [pin({ id: 'a', lng: 121, lat: 14 }), pin({ id: 'b', lng: 122, lat: 15 })]
    expect(spreadCoincidentPins(pins)).toEqual(pins)
  })

  it('fans identical points out by no more than a few hundred metres, without mutating', () => {
    const pins = ['a', 'b', 'c'].map((id) => pin({ id, lng: 121, lat: 14 }))
    const spread = spreadCoincidentPins(pins)

    expect(pins[1].lng).toBe(121)
    expect(spread[0]).toMatchObject({ lng: 121, lat: 14 })
    expect(new Set(spread.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)).size).toBe(3)
    for (const p of spread) {
      expect(Math.hypot(p.lng - 121, p.lat - 14)).toBeLessThan(0.003)
    }
  })
})

describe('summarizeClientMap', () => {
  it('counts totals, mapped, exact pins and clients joined in the last 30 days', () => {
    const now = new Date('2026-09-24T00:00:00Z')
    const pins = [
      pin({ id: 'a', source: 'saved', createdAt: '2026-09-20T00:00:00Z' }),
      pin({ id: 'b', source: 'address', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    const unmapped = [
      { id: 'c', name: 'C', slug: 'c', logoUrl: null, color: '#fff', createdAt: '2026-09-01T00:00:00Z', address: null, reason: 'no_address' as const },
    ]

    expect(summarizeClientMap(pins, unmapped, now)).toEqual({
      total: 3,
      mapped: 2,
      exact: 1,
      newThisMonth: 2,
    })
  })
})
