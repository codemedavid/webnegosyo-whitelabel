import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_ORDERS_FILTERS,
  dateRangeWindow,
  hasNarrowingFilters,
  ordersTableHref,
  parseOrderSearch,
  parseOrdersTableFilters,
} from '@/lib/admin/orders-table/filters'
import { MIDNIGHT_SCHEDULE, parseCutoffSchedule } from '@/lib/business-day/trading-day'
import { OUTLET_FILTER_UNASSIGNED } from '@/lib/outlets/order-outlet-display'

const BRANCH = '0f8b1c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f'

describe('parseOrdersTableFilters', () => {
  it('opens on the last 7 days, every status, page 1 with no params', () => {
    expect(parseOrdersTableFilters({})).toEqual(DEFAULT_ORDERS_FILTERS)
  })

  it('reads every filter from the address', () => {
    expect(
      parseOrdersTableFilters({
        status: 'ready',
        range: '7d',
        type: 'Delivery',
        branch: BRANCH.toUpperCase(),
        payment: 'proof',
        q: '#12',
        page: '3',
      }),
    ).toEqual({ status: 'ready', range: '7d', type: 'Delivery', branch: BRANCH, payment: 'proof', q: '#12', page: 3 })
  })

  it('falls back instead of throwing on a hand-edited link', () => {
    const filters = parseOrdersTableFilters({
      status: 'shipped',
      range: 'forever',
      branch: "x' or 1=1",
      payment: 'free',
      page: '-2',
    })
    expect(filters.status).toBe('all')
    expect(filters.range).toBe('7d')
    expect(filters.branch).toBeNull()
    expect(filters.payment).toBe('all')
    expect(filters.page).toBe(1)
  })

  it('keeps the "no branch" choice and takes the first of repeated params', () => {
    expect(parseOrdersTableFilters({ branch: OUTLET_FILTER_UNASSIGNED }).branch).toBe(OUTLET_FILTER_UNASSIGNED)
    expect(parseOrdersTableFilters({ status: ['ready', 'pending'] }).status).toBe('ready')
  })

  it('cuts a pasted search to 60 characters', () => {
    expect(parseOrdersTableFilters({ q: 'a'.repeat(200) }).q).toHaveLength(60)
  })
})

describe('ordersTableHref', () => {
  const base = '/acme/admin/orders'

  it('leaves defaults out of the address', () => {
    expect(ordersTableHref(base, DEFAULT_ORDERS_FILTERS)).toBe(base)
  })

  it('goes back to page 1 when a filter changes', () => {
    const onPage4 = { ...DEFAULT_ORDERS_FILTERS, page: 4 }
    expect(ordersTableHref(base, onPage4, { status: 'pending' })).toBe(`${base}?status=pending`)
  })

  it('keeps the other filters when only the page changes', () => {
    const filters = { ...DEFAULT_ORDERS_FILTERS, status: 'ready' as const, q: ' Ana ' }
    expect(ordersTableHref(base, filters, { page: 2 })).toBe(`${base}?status=ready&q=Ana&page=2`)
  })

  it('round-trips through the parser', () => {
    const filters = {
      status: 'cancelled' as const,
      range: '30d' as const,
      type: 'Dine In',
      branch: BRANCH,
      payment: 'unpaid' as const,
      q: 'Ana',
      page: 2,
    }
    const href = ordersTableHref(base, filters, { page: 2 })
    const params = Object.fromEntries(new URL(href, 'https://x.test').searchParams)
    expect(parseOrdersTableFilters(params)).toEqual(filters)
  })
})

describe('hasNarrowingFilters', () => {
  it('ignores the tab and the date, which every view has', () => {
    expect(hasNarrowingFilters({ ...DEFAULT_ORDERS_FILTERS, status: 'ready', range: 'all' })).toBe(false)
    expect(hasNarrowingFilters({ ...DEFAULT_ORDERS_FILTERS, q: 'ana' })).toBe(true)
  })
})

describe('dateRangeWindow', () => {
  // 2026-11-21 10:00 Manila = 02:00 UTC.
  const now = Date.parse('2026-11-21T02:00:00.000Z')

  it('is the Manila calendar day for a store without a cutoff', () => {
    expect(dateRangeWindow('today', now, MIDNIGHT_SCHEDULE)).toEqual({
      startIso: '2026-11-20T16:00:00.000Z',
      endIso: '2026-11-21T16:00:00.000Z',
    })
    expect(dateRangeWindow('yesterday', now, MIDNIGHT_SCHEDULE)).toEqual({
      startIso: '2026-11-19T16:00:00.000Z',
      endIso: '2026-11-20T16:00:00.000Z',
    })
  })

  it('spans whole days for 7 and 30 days, ending with today', () => {
    expect(dateRangeWindow('7d', now, MIDNIGHT_SCHEDULE)).toEqual({
      startIso: '2026-11-14T16:00:00.000Z',
      endIso: '2026-11-21T16:00:00.000Z',
    })
    expect(dateRangeWindow('30d', now, MIDNIGHT_SCHEDULE)?.startIso).toBe('2026-10-22T16:00:00.000Z')
  })

  it("keeps a late-night order on the bar's own day", () => {
    // Business day ends at 2 AM; 01:30 Manila on the 21st is still the 20th.
    const schedule = parseCutoffSchedule([{ effective_from: '2026-01-01', cutoff_minutes: 120 }])
    const lateNight = Date.parse('2026-11-20T17:30:00.000Z')
    expect(dateRangeWindow('today', lateNight, schedule)).toEqual({
      startIso: '2026-11-19T18:00:00.000Z',
      endIso: '2026-11-20T18:00:00.000Z',
    })
  })

  it('has no window for all time', () => {
    expect(dateRangeWindow('all', now, MIDNIGHT_SCHEDULE)).toBeNull()
  })
})

describe('parseOrderSearch', () => {
  it('reads "#12" and "12" as an order number as well as text', () => {
    expect(parseOrderSearch('#12')).toEqual({ text: '12', orderNumber: 12 })
    expect(parseOrderSearch(' 0007 ')).toEqual({ text: '0007', orderNumber: 7 })
  })

  it('keeps the characters names and phones use', () => {
    expect(parseOrderSearch("Ma. O'Neil-Cruz").text).toBe("Ma. O'Neil-Cruz")
    expect(parseOrderSearch('+63 917 123').text).toBe('+63 917 123')
    expect(parseOrderSearch('Niño').text).toBe('Niño')
  })

  it('turns PostgREST syntax and wildcards into spaces', () => {
    expect(parseOrderSearch('a,b)(c"d\\e%f_g*h').text).toBe('a b c d e f g h')
    expect(parseOrderSearch('Ana (table 4)')).toEqual({ text: 'Ana table 4', orderNumber: null })
  })

  it('is empty for nothing but punctuation', () => {
    expect(parseOrderSearch(' ,(%) ')).toEqual({ text: '', orderNumber: null })
  })
})
