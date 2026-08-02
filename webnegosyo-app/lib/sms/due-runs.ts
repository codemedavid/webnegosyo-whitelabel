/**
 * Which campaigns can run right now.
 *
 * This is the module that decides whether a merchant gets a "1 campaign ready
 * to send" prompt, so its two hard rules are both about NOT sending:
 *
 *  1. **Only `active` fires.** A draft is half-written and a paused campaign
 *     was stopped on purpose; either one firing because its date arrived would
 *     be a blast the merchant never agreed to. Both are still returned in the
 *     list so they remain visible — they just carry `dueAt: null`.
 *  2. **A one-off never fires twice.** Due-ness is computed as the first
 *     occurrence strictly *after the last run*, so once `lastRunAt` is set the
 *     one-off's date is behind it and `computeNextDueAt` returns null forever.
 *     Anchoring on "now" instead would re-fire the same campaign to the same
 *     guests on every poll, which is the worst failure this feature has.
 *
 * Nothing here sends or writes. The screen decides what to do with the states.
 */

import { computeNextDueAt } from "./schedule";
import type { SmsCampaignSchedule } from "./types";

export type CampaignStatus = "draft" | "active" | "paused" | "archived";

export interface ScheduledCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: Date;
  /** When this campaign last completed a run; null if it never has. */
  lastRunAt: Date | null;
  schedule: SmsCampaignSchedule;
}

export interface CampaignDueState {
  campaignId: string;
  name: string;
  status: CampaignStatus;
  /** Next moment it becomes due, or null when it never will again. */
  dueAt: Date | null;
  isDue: boolean;
  /** How long it has been waiting past its due moment; 0 when not due. */
  overdueByMs: number;
}

function dueStateFor(campaign: ScheduledCampaign, now: Date): CampaignDueState {
  const base = {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
  };

  if (campaign.status !== "active") {
    return { ...base, dueAt: null, isDue: false, overdueByMs: 0 };
  }

  // Anchored on the last run (falling back to creation), never on `now` — see
  // the module comment on why anchoring on now re-fires one-offs forever.
  const anchor = campaign.lastRunAt ?? campaign.createdAt;
  const dueAt = computeNextDueAt(campaign.schedule, {
    after: anchor,
    lastRunAt: campaign.lastRunAt,
    createdAt: campaign.createdAt,
  });

  if (!dueAt) {
    return { ...base, dueAt: null, isDue: false, overdueByMs: 0 };
  }

  const isDue = dueAt.getTime() <= now.getTime();
  return {
    ...base,
    dueAt,
    isDue,
    overdueByMs: isDue ? now.getTime() - dueAt.getTime() : 0,
  };
}

export function computeCampaignDueStates(
  campaigns: readonly ScheduledCampaign[],
  now: Date
): CampaignDueState[] {
  return campaigns.map((campaign) => dueStateFor(campaign, now));
}

/**
 * The campaigns ready to send, most overdue first.
 *
 * Ordering matters when several are ready at once and Android's throttle means
 * only one run's worth of messages will realistically go out: the audience that
 * has been waiting longest should be the one that gets served.
 */
export function dueNow(states: readonly CampaignDueState[]): CampaignDueState[] {
  return states
    .filter((state) => state.isDue)
    .sort((a, b) => b.overdueByMs - a.overdueByMs);
}

/** The soonest campaign still ahead, for a "next run" line. Null if none. */
export function nextUpcoming(
  states: readonly CampaignDueState[]
): CampaignDueState | null {
  const upcoming = states
    .filter((state) => !state.isDue && state.dueAt !== null)
    .sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime());

  return upcoming[0] ?? null;
}
