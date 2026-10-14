/**
 * "Your activity": one person's own Store activity (design spec §2, cashier
 * task 5 — "see her own activity today"). A utility screen, not a tab, so no
 * staff tab bar changes; doors on Account and the Drawer (POS sales).
 *
 * The read always names the caller as the actor. For staff without the store
 * view the server would return only their own rows anyway; for an owner or
 * manager opening it, the filter is what makes it "yours".
 */

import { DEFAULT_ACTIVITY_FILTERS, type ActivityFilters, type ActivityPeriod } from "./filters";

export const MY_ACTIVITY_HREF = "/(main)/my-activity";

export interface MyActivityViewer {
  userId: string | null;
  tenantId: string | null;
  /** Demo mode has no real account behind it, so nothing of "yours" exists. */
  isDemo: boolean;
}

export function canOpenMyActivity(viewer: MyActivityViewer): boolean {
  return Boolean(viewer.userId) && Boolean(viewer.tenantId) && !viewer.isDemo;
}

export function myActivityFilters(userId: string, period: ActivityPeriod): ActivityFilters {
  return { ...DEFAULT_ACTIVITY_FILTERS, period, actor: { id: userId, name: "You" } };
}
