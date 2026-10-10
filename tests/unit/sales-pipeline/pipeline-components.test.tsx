import { render, screen, within } from '@testing-library/react'
import { NeedsAttentionPanel } from '@/components/superadmin/pipeline/needs-attention-panel'
import { PipelineFiltersBar } from '@/components/superadmin/pipeline/pipeline-filters'
import { PipelineStages } from '@/components/superadmin/pipeline/pipeline-stages'
import { findNeedsAttention } from '@/lib/sales-pipeline/needs-attention'
import { summarizePipeline } from '@/lib/sales-pipeline/stages'
import { buildLead, hoursAgo, NOW_MS } from './fixtures'

describe('PipelineStages', () => {
  it('lists every stage with its count and conversion', () => {
    const summary = summarizePipeline([
      buildLead({ id: 'a' }),
      buildLead({ id: 'b', status: 'paid', paidAt: hoursAgo(5) }),
    ])

    render(<PipelineStages stages={summary.stages} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(9)
    expect(within(rows[0]).getByText('Ordered')).toBeInTheDocument()
    expect(within(rows[0]).getByText('2')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Paid')).toBeInTheDocument()
    expect(within(rows[2]).getByText('100%')).toBeInTheDocument()
  })
})

describe('NeedsAttentionPanel', () => {
  it('links each waiting lead to its Checkout Leads panel and marks overdue ones', () => {
    const groups = findNeedsAttention(
      [
        buildLead({ id: 'lead-old', businessName: 'Old Proof Cafe', proofUploadedAt: hoursAgo(30) }),
        buildLead({ id: 'lead-new', businessName: 'New Proof Diner', proofUploadedAt: hoursAgo(2) }),
      ],
      NOW_MS,
    )

    render(<NeedsAttentionPanel groups={groups} nowMs={NOW_MS} />)

    expect(screen.getByText('Payment proof waiting')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Old Proof Cafe/ })).toHaveAttribute(
      'href',
      '/superadmin/checkout-leads?lead=lead-old',
    )
    expect(screen.getByRole('link', { name: /New Proof Diner/ })).toHaveTextContent('2h')
  })

  it('says so when nobody is waiting', () => {
    render(<NeedsAttentionPanel groups={[]} nowMs={NOW_MS} />)

    expect(screen.getByText('Nobody is waiting on a human')).toBeInTheDocument()
  })

  it('caps a long group and points to Checkout Leads for the rest', () => {
    const leads = Array.from({ length: 10 }, (_, index) =>
      buildLead({ id: `lead-${index}`, businessName: `Store ${index}`, proofUploadedAt: hoursAgo(index + 1) }),
    )

    render(<NeedsAttentionPanel groups={findNeedsAttention(leads, NOW_MS)} nowMs={NOW_MS} />)

    expect(screen.getAllByRole('link', { name: /^Store \d/ })).toHaveLength(8)
    expect(screen.getByText(/\+2 more on/)).toBeInTheDocument()
  })
})

describe('PipelineFiltersBar', () => {
  it('keeps the other filter when switching one', () => {
    render(<PipelineFiltersBar filters={{ range: '7d', offer: 'monthly' }} />)

    expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute(
      'href',
      '/superadmin/pipeline?offer=monthly&range=all',
    )
    expect(screen.getByRole('link', { name: 'One-time checkout' })).toHaveAttribute(
      'href',
      '/superadmin/pipeline?offer=one_time&range=7d',
    )
    expect(screen.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'true')
  })
})
