/**
 * One checkout lead as the superadmin sales pipeline sees it: the lead, its
 * set-up link (store_onboardings), and what its store did afterwards.
 *
 * Instants are ISO strings exactly as Postgres returns them; the engine parses
 * them itself and ignores anything unparseable rather than inventing a time.
 */

import type { OnboardingStatus } from '@/lib/onboarding/repository'
import type { CheckoutLeadStatus } from '@/types/database'

export interface PipelineOnboarding {
  status: OnboardingStatus
  /** When staff issued the set-up link. */
  createdAt: string
  /** When the latest build started (the wizard was submitted just before). */
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
  error: string | null
}

export interface PipelineLead {
  id: string
  referenceNumber: string
  businessName: string
  contactName: string
  status: CheckoutLeadStatus
  paymentTerm: string | null
  createdAt: string
  proofUploadedAt: string | null
  paidAt: string | null
  liveAt: string | null
  tenantId: string | null
  onboarding: PipelineOnboarding | null
  /** The store's first non-cancelled order, if it has a store. */
  firstOrderAt: string | null
  /** The store's second recorded subscription payment. */
  secondPaymentAt: string | null
}
