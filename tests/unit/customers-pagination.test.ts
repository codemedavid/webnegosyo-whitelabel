import { computeCustomersPagination } from '@/lib/customers-pagination'

/**
 * Pure pagination math for the web-admin Customers list. Extracted so the
 * offset/range/clamp logic is unit-tested in isolation, while the Supabase
 * count query in customers-service stays thin glue (mirrors how `rowToFacts`
 * is the tested pure part next to the untestable client chain).
 */

const PAGE_SIZE = 50

describe('computeCustomersPagination', () => {
  it('describes the first page of several', () => {
    const p = computeCustomersPagination(120, 1, PAGE_SIZE)

    expect(p).toEqual({
      currentPage: 1,
      totalPages: 3,
      offset: 0,
      limit: 50,
      hasPreviousPage: false,
      hasNextPage: true,
      rangeStart: 1,
      rangeEnd: 50,
      totalCount: 120,
    })
  })

  it('describes a middle page', () => {
    const p = computeCustomersPagination(120, 2, PAGE_SIZE)

    expect(p.offset).toBe(50)
    expect(p.rangeStart).toBe(51)
    expect(p.rangeEnd).toBe(100)
    expect(p.hasPreviousPage).toBe(true)
    expect(p.hasNextPage).toBe(true)
  })

  it('caps the range end at the total on a partial last page', () => {
    const p = computeCustomersPagination(120, 3, PAGE_SIZE)

    expect(p.offset).toBe(100)
    expect(p.rangeStart).toBe(101)
    expect(p.rangeEnd).toBe(120)
    expect(p.hasNextPage).toBe(false)
  })

  it('clamps a page past the end back to the last page', () => {
    const p = computeCustomersPagination(120, 99, PAGE_SIZE)

    expect(p.currentPage).toBe(3)
    expect(p.offset).toBe(100)
    expect(p.hasNextPage).toBe(false)
  })

  it('clamps a page below 1 up to the first page', () => {
    expect(computeCustomersPagination(120, 0, PAGE_SIZE).currentPage).toBe(1)
    expect(computeCustomersPagination(120, -5, PAGE_SIZE).currentPage).toBe(1)
  })

  it('treats a non-finite requested page as the first page', () => {
    expect(computeCustomersPagination(120, Number.NaN, PAGE_SIZE).currentPage).toBe(1)
  })

  it('handles a tenant with zero customers without dividing by zero', () => {
    const p = computeCustomersPagination(0, 1, PAGE_SIZE)

    expect(p).toEqual({
      currentPage: 1,
      totalPages: 0,
      offset: 0,
      limit: 50,
      hasPreviousPage: false,
      hasNextPage: false,
      rangeStart: 0,
      rangeEnd: 0,
      totalCount: 0,
    })
  })

  it('handles a single partial page', () => {
    const p = computeCustomersPagination(12, 1, PAGE_SIZE)

    expect(p.totalPages).toBe(1)
    expect(p.rangeStart).toBe(1)
    expect(p.rangeEnd).toBe(12)
    expect(p.hasNextPage).toBe(false)
    expect(p.hasPreviousPage).toBe(false)
  })
})
