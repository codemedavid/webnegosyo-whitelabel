import {
  leadTenantId,
  secondPaymentByTenant,
  toPipelineLeads,
  type LeadRow,
  type OnboardingRow,
} from '@/lib/sales-pipeline/rows'

function leadRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead-1',
    reference_number: 'SM-0001',
    business_name: 'Kape Tayo',
    name: 'Ana',
    status: 'paid',
    payment_term: 'monthly_subscription',
    created_at: '2026-10-01T00:00:00.000Z',
    payment_proof_uploaded_at: null,
    paid_at: '2026-10-02T00:00:00.000Z',
    live_at: null,
    tenant_id: null,
    ...overrides,
  }
}

function onboardingRow(overrides: Partial<OnboardingRow> = {}): OnboardingRow {
  return {
    checkout_lead_id: 'lead-1',
    tenant_id: 't-1',
    status: 'ready',
    created_at: '2026-10-02T01:00:00.000Z',
    started_at: '2026-10-02T02:00:00.000Z',
    finished_at: '2026-10-02T02:01:00.000Z',
    updated_at: '2026-10-02T02:01:00.000Z',
    error: null,
    ...overrides,
  }
}

describe('secondPaymentByTenant', () => {
  it('picks the second payment by date, whatever order the rows come in', () => {
    const second = secondPaymentByTenant([
      { tenant_id: 't-1', paid_at: '2026-12-01T00:00:00.000Z' },
      { tenant_id: 't-1', paid_at: '2026-10-01T00:00:00.000Z' },
      { tenant_id: 't-1', paid_at: '2026-11-01T00:00:00.000Z' },
      { tenant_id: 't-2', paid_at: '2026-10-01T00:00:00.000Z' },
    ])

    expect(second.get('t-1')).toBe('2026-11-01T00:00:00.000Z')
    expect(second.has('t-2')).toBe(false)
  })
})

describe('leadTenantId', () => {
  it("prefers the lead's own store, then its set-up link's", () => {
    expect(leadTenantId(leadRow({ tenant_id: 't-lead' }), onboardingRow({ tenant_id: 't-ob' }))).toBe('t-lead')
    expect(leadTenantId(leadRow(), onboardingRow({ tenant_id: 't-ob' }))).toBe('t-ob')
    expect(leadTenantId(leadRow(), undefined)).toBeNull()
  })
})

describe('toPipelineLeads', () => {
  it('joins the set-up link, first order and second payment onto each lead', () => {
    const [lead] = toPipelineLeads([leadRow()], [onboardingRow()], {
      firstOrderAt: new Map([['t-1', '2026-10-03T00:00:00.000Z']]),
      payments: [
        { tenant_id: 't-1', paid_at: '2026-10-02T00:00:00.000Z' },
        { tenant_id: 't-1', paid_at: '2026-11-02T00:00:00.000Z' },
      ],
    })

    expect(lead).toMatchObject({
      id: 'lead-1',
      businessName: 'Kape Tayo',
      contactName: 'Ana',
      tenantId: 't-1',
      paidAt: '2026-10-02T00:00:00.000Z',
      onboarding: { status: 'ready', createdAt: '2026-10-02T01:00:00.000Z' },
      firstOrderAt: '2026-10-03T00:00:00.000Z',
      secondPaymentAt: '2026-11-02T00:00:00.000Z',
    })
  })

  it('leaves store facts empty for a lead with no store', () => {
    const [lead] = toPipelineLeads([leadRow({ status: 'initiated', paid_at: null })], [], {
      firstOrderAt: new Map(),
      payments: [],
    })

    expect(lead).toMatchObject({ tenantId: null, onboarding: null, firstOrderAt: null, secondPaymentAt: null })
  })
})
