/**
 * What a campaign's row says about itself.
 *
 * `CampaignDueState` already knows everything here; the list simply was not
 * asking. It said "Ready to send", "Next Aug 5", or — for anything paused,
 * archived or still a draft — "Not scheduled", which reads as a setting the
 * merchant forgot rather than the state their campaign is actually in.
 *
 * Status is answered before the date, because a paused campaign's next due
 * moment is not a promise the app intends to keep.
 */

import type { CampaignDueState } from "./due-runs";

const DAY_MS = 86_400_000;

export interface CampaignTiming {
  line: string;
  /** True when the merchant is the only thing standing between this and a send. */
  isUrgent: boolean;
}

export function describeCampaignTiming(state: CampaignDueState): CampaignTiming {
  if (state.status === "draft") {
    return { line: "Draft — it will not send yet", isUrgent: false };
  }
  if (state.status === "paused") return { line: "Paused", isUrgent: false };
  if (state.status === "archived") return { line: "Archived", isUrgent: false };

  if (state.isDue) {
    const days = Math.floor(state.overdueByMs / DAY_MS);
    // Under a day is just "due" — a campaign scheduled for 9am and opened at
    // 9:30 has not gone wrong, and calling it overdue would train the merchant
    // to ignore the word by the time it means something.
    if (days < 1) return { line: "Ready to send", isUrgent: true };

    const noun = days === 1 ? "day" : "days";
    return { line: `Waiting ${days} ${noun} to be sent`, isUrgent: true };
  }

  if (state.dueAt) {
    const when = state.dueAt.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
    return { line: `Next on ${when}`, isUrgent: false };
  }

  return { line: "No send date set", isUrgent: false };
}
