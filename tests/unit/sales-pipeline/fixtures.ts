import type { PipelineLead } from '@/lib/sales-pipeline/types'

export const NOW_MS = Date.parse('2026-10-09T06:00:00.000Z')

const HOUR_MS = 60 * 60 * 1000

/** An ISO instant `hours` before NOW. */
export function hoursAgo(hours: number): string {
  return new Date(NOW_MS - hours * HOUR_MS).toISOString()
}

export function buildLead(overrides: Partial<PipelineLead> = {}): PipelineLead {
  return {
    id: 'lead-1',
    referenceNumber: 'SM-0001',
    businessName: 'Kape Tayo',
    contactName: 'Ana',
    status: 'initiated',
    paymentTerm: 'monthly_subscription',
    createdAt: hoursAgo(240),
    proofUploadedAt: null,
    paidAt: null,
    liveAt: null,
    tenantId: null,
    onboarding: null,
    firstOrderAt: null,
    secondPaymentAt: null,
    ...overrides,
  }
}
