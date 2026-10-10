/**
 * What the automated build set up, as shown on the "Your store is ready" page
 * and the store's launch checklist. Stored on the onboarding row.
 */

import type { BoostIdeaKind } from '@/lib/boost/ideas'
import type { DesignSource } from './design-step'
import type { StoreLook } from './store-type'
import type { LaunchHero } from './launch-heroes'

export interface LaunchBuildSummary {
  brandColor: string | null
  menu: { categories: number; items: number; failed: number } | null
  bestSellerNames: string[]
  paymentMethods: string[]
  offers: Array<{ kind: BoostIdeaKind; title: string }>
  /** Combos drafted for the owner's OK; absent on builds from before approvals. */
  offersAwaitingApproval?: Array<{ kind: BoostIdeaKind; title: string }>
  loyalty: { rewardLabel: string; threshold: number; minSpend?: number | null } | null
  /** Ready-made texts saved as drafts; absent on builds from before campaigns. */
  campaigns?: { drafted: number } | null
  /** The launch look, hero and why; absent on builds from before the design step. */
  design?: { look: StoreLook; hero?: LaunchHero; reason: string; source: DesignSource } | null
  /** Things the owner should look at, in plain words. */
  warnings: string[]
}

export const EMPTY_BUILD_SUMMARY: LaunchBuildSummary = {
  brandColor: null,
  menu: null,
  bestSellerNames: [],
  paymentMethods: [],
  offers: [],
  loyalty: null,
  warnings: [],
}
