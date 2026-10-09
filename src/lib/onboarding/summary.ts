/**
 * What the automated build set up, as shown on the "Your store is ready" page
 * and the store's launch checklist. Stored on the onboarding row.
 */

import type { BoostIdeaKind } from '@/lib/boost/ideas'
import type { DesignSource } from './design-step'
import type { StoreLook } from './store-type'

export interface LaunchBuildSummary {
  brandColor: string | null
  menu: { categories: number; items: number; failed: number } | null
  bestSellerNames: string[]
  paymentMethods: string[]
  offers: Array<{ kind: BoostIdeaKind; title: string }>
  loyalty: { rewardLabel: string; threshold: number } | null
  /** The launch look and why; absent on builds from before the design step. */
  design?: { look: StoreLook; reason: string; source: DesignSource } | null
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
