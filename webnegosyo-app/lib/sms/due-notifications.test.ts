/**
 * Telling the merchant a campaign is ready.
 *
 * Due-ness has been computed since Phase 5, but only ever *displayed* — a
 * campaign became due silently and stayed that way until someone happened to
 * open the Customers tab. A 10am win-back campaign scheduled on Monday sends on
 * Thursday afternoon, if at all, which makes the whole scheduling feature
 * decorative.
 *
 * Background *sending* was rejected (OEM battery managers kill WorkManager), but
 * a local notification scheduled for a future instant is delivered by Android
 * itself without the app running. That is what this module plans.
 *
 * The load-bearing rule is the dedupe. This plan is recomputed every time the
 * app opens, and the unit of identity is one campaign's ONE due moment — not the
 * campaign. Keying on the campaign would silence a recurring campaign forever
 * after its first notification; keying on nothing would stack a fresh
 * notification every time the merchant opened the app.
 */

import { planDueNotifications, occurrenceKey } from "./due-notifications";
import type { CampaignDueState } from "./due-runs";

const NOW = new Date("2026-08-03T02:00:00.000Z"); // 10:00 Manila
const QUIET = { quietHoursStart: "21:00", quietHoursEnd: "08:00" };

function state(overrides: Partial<CampaignDueState> = {}): CampaignDueState {
  return {
    campaignId: "camp-1",
    name: "Win back lapsed guests",
    status: "active",
    dueAt: new Date("2026-08-04T02:00:00.000Z"),
    isDue: false,
    overdueByMs: 0,
    ...overrides,
  };
}

function plan(states: CampaignDueState[], knownKeys: string[] = []) {
  return planDueNotifications({ states, knownKeys, now: NOW, ...QUIET });
}

describe("occurrenceKey", () => {
  it("identifies one campaign's one due moment, not the campaign", () => {
    const first = occurrenceKey("camp-1", new Date("2026-08-04T02:00:00.000Z"));
    const second = occurrenceKey("camp-1", new Date("2026-08-18T02:00:00.000Z"));

    expect(first).not.toBe(second);
  });

  it("is stable, so recomputing the same occurrence yields the same key", () => {
    const due = new Date("2026-08-04T02:00:00.000Z");

    expect(occurrenceKey("camp-1", due)).toBe(occurrenceKey("camp-1", due));
  });
});

describe("planDueNotifications — what gets scheduled", () => {
  it("schedules an upcoming campaign at the moment it becomes due", () => {
    const { schedule } = plan([state()]);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].fireAt.toISOString()).toBe("2026-08-04T02:00:00.000Z");
  });

  it("names the campaign, so a merchant running several knows which one", () => {
    const { schedule } = plan([state()]);

    expect(schedule[0].body).toContain("Win back lapsed guests");
  });

  it("still notifies about a campaign that is already overdue", () => {
    // The merchant missed it. Staying silent leaves the audience waiting
    // indefinitely, which is the exact failure this module exists to fix.
    const overdue = state({
      dueAt: new Date("2026-08-02T02:00:00.000Z"),
      isDue: true,
      overdueByMs: 86_400_000,
    });

    const { schedule } = plan([overdue]);

    expect(schedule).toHaveLength(1);
    expect(schedule[0].fireAt.getTime()).toBe(NOW.getTime());
  });

  it("never schedules a draft, paused or archived campaign", () => {
    // Each was stopped or never started on purpose; a notification would be
    // prompting the merchant to send something they chose not to.
    for (const status of ["draft", "paused", "archived"] as const) {
      const { schedule } = plan([state({ status, dueAt: null })]);

      expect({ status, scheduled: schedule.length }).toEqual({ status, scheduled: 0 });
    }
  });

  it("never schedules a campaign that will never be due again", () => {
    const { schedule } = plan([state({ dueAt: null })]);

    expect(schedule).toEqual([]);
  });

  it("schedules each of several due campaigns", () => {
    const { schedule } = plan([
      state({ campaignId: "a", name: "A" }),
      state({ campaignId: "b", name: "B" }),
    ]);

    expect(schedule.map((n) => n.campaignId).sort()).toEqual(["a", "b"]);
  });
});

describe("planDueNotifications — never notifying twice", () => {
  it("does not re-schedule an occurrence already handled", () => {
    // The plan is recomputed on every app open. Without this the merchant
    // collects one notification per launch for the same campaign.
    const only = state();
    const known = occurrenceKey(only.campaignId, only.dueAt as Date);

    expect(plan([only], [known]).schedule).toEqual([]);
  });

  it("does schedule the NEXT occurrence of a recurring campaign", () => {
    // Keying on the campaign instead of the occurrence would silence every
    // recurring campaign forever after its first notification.
    const first = state();
    const known = occurrenceKey(first.campaignId, first.dueAt as Date);
    const nextCycle = state({ dueAt: new Date("2026-08-18T02:00:00.000Z") });

    expect(plan([nextCycle], [known]).schedule).toHaveLength(1);
  });

  it("reports the keys worth remembering, so the caller can persist them", () => {
    const only = state();

    const { keepKeys } = plan([only]);

    expect(keepKeys).toEqual([occurrenceKey(only.campaignId, only.dueAt as Date)]);
  });

  it("keeps remembering an occurrence that is still pending", () => {
    // Dropping it from `keepKeys` would let the next launch re-notify.
    const only = state();
    const known = occurrenceKey(only.campaignId, only.dueAt as Date);

    expect(plan([only], [known]).keepKeys).toContain(known);
  });
});

describe("planDueNotifications — taking it back", () => {
  it("cancels a scheduled notification when its campaign is paused", () => {
    const paused = state({ status: "paused", dueAt: null });
    const stale = occurrenceKey("camp-1", new Date("2026-08-04T02:00:00.000Z"));

    const { cancelKeys } = plan([paused], [stale]);

    expect(cancelKeys).toContain(stale);
  });

  it("cancels a notification for a campaign that no longer exists", () => {
    const { cancelKeys } = plan([], ["camp-deleted@2026-08-04T02:00:00.000Z"]);

    expect(cancelKeys).toContain("camp-deleted@2026-08-04T02:00:00.000Z");
  });

  it("cancels the old occurrence when a campaign is rescheduled", () => {
    // The merchant moved a 10am campaign to 4pm. The 10am notification is
    // already sitting in Android's queue and must not still fire.
    const moved = state({ dueAt: new Date("2026-08-04T08:00:00.000Z") });
    const stale = occurrenceKey("camp-1", new Date("2026-08-04T02:00:00.000Z"));

    const { cancelKeys, schedule } = plan([moved], [stale]);

    expect(cancelKeys).toContain(stale);
    expect(schedule).toHaveLength(1);
  });

  it("does not cancel an occurrence that is still live", () => {
    const only = state();
    const known = occurrenceKey(only.campaignId, only.dueAt as Date);

    expect(plan([only], [known]).cancelKeys).toEqual([]);
  });
});

describe("planDueNotifications — quiet hours", () => {
  it("holds an overdue campaign until the quiet window reopens", () => {
    // 2am Manila. A marketing prompt that wakes the merchant is how this
    // feature gets switched off entirely.
    const middleOfNight = new Date("2026-08-03T18:00:00.000Z"); // 02:00 Manila
    const overdue = state({
      dueAt: new Date("2026-08-02T02:00:00.000Z"),
      isDue: true,
      overdueByMs: 1,
    });

    const { schedule } = planDueNotifications({
      states: [overdue],
      knownKeys: [],
      now: middleOfNight,
      ...QUIET,
    });

    expect(schedule[0].fireAt.getTime()).toBeGreaterThan(middleOfNight.getTime());
  });

  it("leaves a daytime notification exactly when it is due", () => {
    const { schedule } = plan([state()]);

    expect(schedule[0].fireAt.toISOString()).toBe("2026-08-04T02:00:00.000Z");
  });
});

describe("planDueNotifications — purity", () => {
  it("does not mutate the states it was given", () => {
    const only = state();
    const snapshot = JSON.stringify(only);

    plan([only]);

    expect(JSON.stringify(only)).toBe(snapshot);
  });
});
