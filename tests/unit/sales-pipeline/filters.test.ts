import {
  DEFAULT_PIPELINE_FILTERS,
  filterPipelineLeads,
  parsePipelineFilters,
  windowStartMs,
} from '@/lib/sales-pipeline/filters'
import { buildLead, hoursAgo, NOW_MS } from './fixtures'

const DAY_MS = 24 * 60 * 60 * 1000

describe('parsePipelineFilters', () => {
  it('defaults to the ₱999 monthly offer over the last 30 days', () => {
    expect(parsePipelineFilters({})).toEqual(DEFAULT_PIPELINE_FILTERS)
    expect(DEFAULT_PIPELINE_FILTERS).toEqual({ range: '30d', offer: 'monthly' })
  })

  it('reads known values from the query string', () => {
    expect(parsePipelineFilters({ range: 'all', offer: 'one_time' })).toEqual({ range: 'all', offer: 'one_time' })
    expect(parsePipelineFilters({ range: '7d', offer: 'all' })).toEqual({ range: '7d', offer: 'all' })
  })

  it('falls back to the default for anything it does not know', () => {
    expect(parsePipelineFilters({ range: '5y', offer: 'constructor' })).toEqual(DEFAULT_PIPELINE_FILTERS)
    expect(parsePipelineFilters({ range: ['7d', '30d'], offer: undefined })).toEqual(DEFAULT_PIPELINE_FILTERS)
  })
})

describe('windowStartMs', () => {
  it('counts whole days back from now', () => {
    expect(windowStartMs('7d', NOW_MS)).toBe(NOW_MS - 7 * DAY_MS)
    expect(windowStartMs('90d', NOW_MS)).toBe(NOW_MS - 90 * DAY_MS)
  })

  it('has no lower bound for all time', () => {
    expect(windowStartMs('all', NOW_MS)).toBeNull()
  })
})

describe('filterPipelineLeads', () => {
  const monthly = buildLead({ id: 'monthly', paymentTerm: 'monthly_subscription', createdAt: hoursAgo(24) })
  const oneTime = buildLead({ id: 'one-time', paymentTerm: 'full_payment', createdAt: hoursAgo(24) })
  const downpayment = buildLead({ id: 'down', paymentTerm: 'downpayment_50', createdAt: hoursAgo(24) })
  const unknownTerm = buildLead({ id: 'none', paymentTerm: null, createdAt: hoursAgo(24) })
  const old = buildLead({ id: 'old', paymentTerm: 'monthly_subscription', createdAt: hoursAgo(24 * 40) })

  const all = [monthly, oneTime, downpayment, unknownTerm, old]

  function ids(leads: { id: string }[]): string[] {
    return leads.map((lead) => lead.id)
  }

  it('keeps the monthly offer only', () => {
    expect(ids(filterPipelineLeads(all, { range: 'all', offer: 'monthly' }, NOW_MS))).toEqual(['monthly', 'old'])
  })

  it('treats every other term, and a missing term, as the one-time checkout', () => {
    expect(ids(filterPipelineLeads(all, { range: 'all', offer: 'one_time' }, NOW_MS))).toEqual(['one-time', 'down', 'none'])
  })

  it('keeps leads created inside the window', () => {
    expect(ids(filterPipelineLeads(all, { range: '30d', offer: 'all' }, NOW_MS))).toEqual(['monthly', 'one-time', 'down', 'none'])
  })
})
