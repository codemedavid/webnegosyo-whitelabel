/**
 * Database rows → PipelineLead. Pure, so the joins (lead ↔ set-up link ↔
 * store ↔ orders ↔ payments) are tested without a database.
 */

import type { OnboardingStatus } from '@/lib/onboarding/repository'
import type { CheckoutLeadStatus } from '@/types/database'
import type { PipelineLead, PipelineOnboarding } from './types'

export interface LeadRow {
  id: string
  reference_number: string
  business_name: string
  name: string
  status: string
  payment_term: string | null
  created_at: string
  payment_proof_uploaded_at: string | null
  paid_at: string | null
  live_at: string | null
  tenant_id: string | null
}

export interface OnboardingRow {
  checkout_lead_id: string
  tenant_id: string | null
  status: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
  error: string | null
}

export interface PaymentRow {
  tenant_id: string
  paid_at: string
}

export interface StoreFacts {
  /** First non-cancelled order per store. */
  firstOrderAt: ReadonlyMap<string, string>
  /** Payments per store, any order. */
  payments: readonly PaymentRow[]
}

function toOnboarding(row: OnboardingRow): PipelineOnboarding {
  return {
    status: row.status as OnboardingStatus,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
    error: row.error,
  }
}

/** The second payment per store, by paid_at. */
export function secondPaymentByTenant(payments: readonly PaymentRow[]): Map<string, string> {
  const byTenant = new Map<string, number[]>()
  for (const payment of payments) {
    const ms = Date.parse(payment.paid_at)
    if (!Number.isFinite(ms)) continue
    byTenant.set(payment.tenant_id, [...(byTenant.get(payment.tenant_id) ?? []), ms])
  }
  const second = new Map<string, string>()
  for (const [tenantId, times] of byTenant) {
    const sorted = [...times].sort((a, b) => a - b)
    if (sorted.length >= 2) second.set(tenantId, new Date(sorted[1]).toISOString())
  }
  return second
}

/** The store a lead became: the lead's own link, else its set-up link's. */
export function leadTenantId(lead: LeadRow, onboarding: OnboardingRow | undefined): string | null {
  return lead.tenant_id ?? onboarding?.tenant_id ?? null
}

export function toPipelineLeads(
  leads: readonly LeadRow[],
  onboardings: readonly OnboardingRow[],
  facts: StoreFacts,
): PipelineLead[] {
  const onboardingByLead = new Map(onboardings.map((row) => [row.checkout_lead_id, row]))
  const secondPayment = secondPaymentByTenant(facts.payments)

  return leads.map((lead) => {
    const onboarding = onboardingByLead.get(lead.id)
    const tenantId = leadTenantId(lead, onboarding)
    return {
      id: lead.id,
      referenceNumber: lead.reference_number,
      businessName: lead.business_name,
      contactName: lead.name,
      status: lead.status as CheckoutLeadStatus,
      paymentTerm: lead.payment_term,
      createdAt: lead.created_at,
      proofUploadedAt: lead.payment_proof_uploaded_at,
      paidAt: lead.paid_at,
      liveAt: lead.live_at,
      tenantId,
      onboarding: onboarding ? toOnboarding(onboarding) : null,
      firstOrderAt: tenantId ? (facts.firstOrderAt.get(tenantId) ?? null) : null,
      secondPaymentAt: tenantId ? (secondPayment.get(tenantId) ?? null) : null,
    }
  })
}
