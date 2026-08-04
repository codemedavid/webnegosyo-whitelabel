/**
 * The line under a campaign's name in the list.
 *
 * The list used to say one of three things: "Ready to send", "Next Aug 5", or
 * "Not scheduled" — and a campaign that had gone quiet said "Not scheduled",
 * which sounds like a setting the merchant forgot rather than a campaign they
 * paused. `CampaignDueState` already carries everything needed to say what is
 * actually true, including how long a due campaign has been waiting.
 */

import { describeCampaignTiming } from "./campaign-summary";
import type { CampaignDueState } from "./due-runs";

const DAY_MS = 86_400_000;

function state(overrides: Partial<CampaignDueState> = {}): CampaignDueState {
  return {
    campaignId: "c-1",
    name: "Win back lapsed guests",
    status: "active",
    dueAt: null,
    isDue: false,
    overdueByMs: 0,
    ...overrides,
  };
}

describe("describeCampaignTiming", () => {
  it("calls a campaign that just came due ready, not overdue", () => {
    const timing = describeCampaignTiming(
      state({ isDue: true, dueAt: new Date(2026, 7, 3, 9), overdueByMs: 60_000 })
    );

    expect(timing.line).toBe("Ready to send");
    expect(timing.isUrgent).toBe(true);
  });

  it("says how long a due campaign has been waiting once it is a day old", () => {
    // A campaign that came due on Monday and is still sitting there on
    // Thursday is the failure this whole feature has; the list has to say so.
    const timing = describeCampaignTiming(
      state({ isDue: true, dueAt: new Date(2026, 7, 1, 9), overdueByMs: 3 * DAY_MS })
    );

    expect(timing.line).toBe("Waiting 3 days to be sent");
  });

  it("speaks singular for a campaign one day overdue", () => {
    const timing = describeCampaignTiming(
      state({ isDue: true, dueAt: new Date(2026, 7, 2, 9), overdueByMs: DAY_MS })
    );

    expect(timing.line).toBe("Waiting 1 day to be sent");
  });

  it("names the next date for a scheduled campaign", () => {
    const timing = describeCampaignTiming(state({ dueAt: new Date(2026, 7, 15, 9) }));

    expect(timing.line).toBe("Next on Aug 15");
    expect(timing.isUrgent).toBe(false);
  });

  it("says a paused campaign is paused, not unscheduled", () => {
    // "Not scheduled" reads as a missing setting. Paused is a decision.
    expect(describeCampaignTiming(state({ status: "paused" })).line).toBe("Paused");
  });

  it("says an archived campaign is finished", () => {
    expect(describeCampaignTiming(state({ status: "archived" })).line).toBe("Archived");
  });

  it("tells a draft it will never send", () => {
    // The draft status is exactly what made every saved campaign inert. A
    // draft that merely says "Draft" repeats its own badge and explains
    // nothing.
    expect(describeCampaignTiming(state({ status: "draft" })).line).toBe(
      "Draft — it will not send yet"
    );
  });

  it("admits when an active campaign has no date ahead of it", () => {
    expect(describeCampaignTiming(state({ status: "active", dueAt: null })).line).toBe(
      "No send date set"
    );
  });
});
