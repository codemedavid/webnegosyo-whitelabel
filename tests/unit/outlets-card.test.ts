import { describe, it, expect } from '@jest/globals'
import {
  buildOutletCard,
  filterOutletsByQuery,
  outletDirectionsUrl,
  type OutletCardSource,
} from '@/lib/outlets/outlet-card'

/**
 * Everything the "Select Your Outlet" card renders, decided without React.
 *
 * The card makes three claims a customer acts on — whether the branch is open,
 * when it closes, and how to drive there — and every one of them is derived
 * from data a merchant may have left blank. Each absence has to degrade to a
 * card that still reads correctly, not to a card that lies or crashes.
 */

const MANILA = 'Asia/Manila'

// 9:40 PM close, every day.
const NINE_FORTY = Object.fromEntries(
  Array.from({ length: 7 }, (_, day) => [String(day), { closed: false, open: '09:00', close: '21:40' }])
)

function makeSource(overrides: Partial<OutletCardSource> = {}): OutletCardSource {
  return {
    id: 'sta-lucia',
    slug: 'sta-lucia',
    name: 'Sta. Lucia Mall Il Centro',
    address: 'Unit G3, Sta. Lucia Il Centro, Marcos Highway',
    image_url: null,
    latitude: null,
    longitude: null,
    operating_hours: NINE_FORTY,
    timezone: MANILA,
    ...overrides,
  }
}

/** 2026-07-28 is a Tuesday. 12:00 Manila = 04:00 UTC. */
const middayTuesday = new Date('2026-07-28T04:00:00Z')
const lateTuesday = new Date('2026-07-28T15:00:00Z') // 23:00 Manila

describe('buildOutletCard — open status', () => {
  it('reports the branch open with its closing time during opening hours', () => {
    // Arrange
    const source = makeSource()

    // Act
    const card = buildOutletCard(source, middayTuesday)

    // Assert
    expect(card.isOpen).toBe(true)
    expect(card.closesAt).toBe('9:40 PM')
  })

  it('reports the branch closed after its closing time', () => {
    const card = buildOutletCard(makeSource(), lateTuesday)

    expect(card.isOpen).toBe(false)
    expect(card.closesAt).toBeNull()
  })

  it('reads hours in the branch timezone, not the runtime one', () => {
    // 04:00 UTC is midday in Manila but 4am in London — a London-timezone
    // branch with the same hours string must read as closed.
    const london = makeSource({ timezone: 'Europe/London' })

    expect(buildOutletCard(london, middayTuesday).isOpen).toBe(false)
  })

  it('treats a branch with no configured hours as open rather than hiding it', () => {
    // A merchant who has not filled in hours has not thereby closed the branch.
    const card = buildOutletCard(makeSource({ operating_hours: null }), lateTuesday)

    expect(card.isOpen).toBe(true)
    expect(card.closesAt).toBeNull()
  })

  it('shows the status regardless of the tenant ordering-enforcement flag', () => {
    // The card label is informational. Enforcement decides whether ordering is
    // blocked — a separate question this module deliberately does not answer.
    const card = buildOutletCard(makeSource(), lateTuesday)

    expect(card.isOpen).toBe(false)
    expect((card as unknown as Record<string, unknown>).isOrderingBlocked).toBeUndefined()
  })
})

describe('buildOutletCard — directions', () => {
  it('builds a map link from coordinates when the branch has them', () => {
    const card = buildOutletCard(
      makeSource({ latitude: 14.5547, longitude: 121.0244 }),
      middayTuesday
    )

    expect(card.directionsUrl).toContain('14.5547')
    expect(card.directionsUrl).toContain('121.0244')
  })

  it('falls back to the written address when coordinates are missing', () => {
    const card = buildOutletCard(makeSource(), middayTuesday)

    expect(card.directionsUrl).toContain(encodeURIComponent('Marcos Highway').slice(0, 6))
  })

  it('offers no direction link at all when there is neither address nor coordinates', () => {
    // A dead link is worse than a missing one — the card must be able to hide it.
    const card = buildOutletCard(makeSource({ address: null }), middayTuesday)

    expect(card.directionsUrl).toBeNull()
  })

  it('never emits a javascript: or other non-https scheme', () => {
    const card = buildOutletCard(
      makeSource({ address: 'javascript:alert(1)' }),
      middayTuesday
    )

    expect(card.directionsUrl?.startsWith('https://')).toBe(true)
  })
})

describe('outletDirectionsUrl', () => {
  it('prefers coordinates over the address when both exist', () => {
    const url = outletDirectionsUrl({ latitude: 1.5, longitude: 2.5, address: 'Somewhere' })

    expect(url).toContain('1.5')
    expect(url).not.toContain('Somewhere')
  })

  it('ignores a half-filled coordinate pair', () => {
    const url = outletDirectionsUrl({ latitude: 1.5, longitude: null, address: 'Somewhere' })

    expect(url).toContain('Somewhere')
  })
})

describe('filterOutletsByQuery', () => {
  const outlets = [
    makeSource({ id: '1', name: 'Sta. Lucia Mall Il Centro', address: 'Marcos Highway, Cainta' }),
    makeSource({ id: '2', name: 'Teleperformance Center', address: 'Ayala Avenue, Makati City' }),
  ]

  it('returns every branch for an empty query', () => {
    expect(filterOutletsByQuery(outlets, '')).toHaveLength(2)
    expect(filterOutletsByQuery(outlets, '   ')).toHaveLength(2)
  })

  it('matches on branch name, case-insensitively', () => {
    expect(filterOutletsByQuery(outlets, 'teleperformance').map((o) => o.id)).toEqual(['2'])
  })

  it('matches on address so a customer can search by where they are', () => {
    expect(filterOutletsByQuery(outlets, 'makati').map((o) => o.id)).toEqual(['2'])
  })

  it('returns nothing rather than everything when no branch matches', () => {
    // Falling back to the full list would silently contradict the search box.
    expect(filterOutletsByQuery(outlets, 'cebu')).toEqual([])
  })

  it('tolerates a branch with no address', () => {
    const noAddress = [makeSource({ id: '3', name: 'Pop-up', address: null })]

    expect(filterOutletsByQuery(noAddress, 'pop')).toHaveLength(1)
    expect(filterOutletsByQuery(noAddress, 'ayala')).toHaveLength(0)
  })
})
