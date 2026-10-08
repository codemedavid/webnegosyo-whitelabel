/**
 * What the buyer's wizard and progress screen may see, built from the
 * onboarding row, its store and its lead. Pure, so the shape — and what it
 * leaves out — is pinned by tests. No ids, hashes or raw errors from inside
 * the platform are exposed: the token holder is the buyer, nobody else.
 */

import { ONBOARDING_BUILD_STEPS, type OnboardingBuildStepId, type StepStatus } from './plan'
import type { OnboardingAssets, OnboardingStatus, StoreOnboarding } from './repository'
import type { LaunchBuildSummary } from './summary'
import { displayedBuildStatus } from './build-staleness'
import { isPaidLeadStatus } from './lead-status'
import type { FirstWeekPlan } from './first-week'
import type { LaunchReadiness } from './readiness'

export interface OnboardingStepView {
  id: OnboardingBuildStepId
  label: string
  status: StepStatus
  detail: string | null
}

export interface OnboardingStoreView {
  name: string
  slug: string
  /** Path the owner signs in at. */
  loginPath: string
  /** Path of the storefront preview (it refuses orders until launch). */
  previewPath: string
  /** The owner's dashboard; the wizard signs them in, so this opens straight in. */
  dashboardPath: string
  isLive: boolean
}

/** Whether "Go live" may be pressed, and what still blocks it. */
export interface OnboardingLaunchView {
  canLaunch: boolean
  blockers: string[]
}

export interface OnboardingView {
  status: OnboardingStatus
  businessName: string
  /** For the greeting only; '' when the lead has no name. */
  ownerFirstName: string
  ownerEmail: string
  assets: Required<OnboardingAssets>
  steps: OnboardingStepView[]
  summary: LaunchBuildSummary | null
  error: string | null
  store: OnboardingStoreView | null
  isLaunchRequested: boolean
  isPaymentConfirmed: boolean
  /** App downloads + University lessons, once the store exists. Filled by the server reader. */
  firstWeek: FirstWeekPlan | null
  /** Null until the build stopped and the checklist was read. */
  launch: OnboardingLaunchView | null
}

export interface OnboardingViewSources {
  onboarding: StoreOnboarding
  lead: { business_name: string; email: string; status: string; name?: string | null }
  tenant: { name: string; slug: string; is_prelaunch: boolean } | null
  readiness?: LaunchReadiness | null
}

export function buildOnboardingView({ onboarding, lead, tenant, readiness = null }: OnboardingViewSources, nowMs: number = Date.now()): OnboardingView {
  const steps = ONBOARDING_BUILD_STEPS.map(({ id, label }) => {
    const state = onboarding.steps[id]
    return { id, label, status: state?.status ?? 'pending', detail: state?.detail ?? null }
  })

  return {
    // A build that died mid-run reads as failed, so the retry button shows.
    status: displayedBuildStatus(onboarding, nowMs),
    businessName: lead.business_name,
    ownerFirstName: (lead.name ?? '').trim().split(/\s+/)[0] ?? '',
    ownerEmail: lead.email,
    assets: {
      logoUrl: onboarding.assets.logoUrl ?? null,
      logoColor: onboarding.assets.logoColor ?? null,
      menuImageUrls: onboarding.assets.menuImageUrls ?? [],
    },
    steps,
    summary: onboarding.summary,
    // A refused submit stores a buyer-facing message; a failed build stores
    // the technical cause for staff, and the steps carry the friendly text.
    error: onboarding.status === 'awaiting_details' ? onboarding.error : null,
    store: tenant
      ? {
          name: tenant.name,
          slug: tenant.slug,
          loginPath: `/${tenant.slug}/login?redirect=${encodeURIComponent(`/${tenant.slug}/admin/launch`)}`,
          previewPath: `/${tenant.slug}/menu`,
          dashboardPath: `/${tenant.slug}/admin`,
          isLive: !tenant.is_prelaunch,
        }
      : null,
    isLaunchRequested: !!onboarding.launchRequestedAt,
    isPaymentConfirmed: isPaidLeadStatus(lead.status),
    firstWeek: null,
    launch: readiness ? { canLaunch: readiness.canLaunch, blockers: readiness.blockers.map((item) => item.label) } : null,
  }
}
