import { computeCampaignDueStates, dueNow, nextUpcoming } from "./due-runs";
import type { ScheduledCampaign } from "./due-runs";

const NOW = new Date("2026-08-20T02:00:00.000Z"); // Thu 20 Aug, 10:00 Manila

function campaign(overrides: Partial<ScheduledCampaign> = {}): ScheduledCampaign {
  return {
    id: "camp-1",
    name: "Win back",
    status: "active",
    createdAt: new Date("2026-08-01T02:00:00.000Z"),
    lastRunAt: null,
    schedule: {
      scheduleKind: "every_n_days",
      scheduleTime: "10:00",
      scheduleDate: null,
      scheduleIntervalDays: 7,
      scheduleWeekdays: [],
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
    },
    ...overrides,
  };
}

describe("computeCampaignDueStates — only active campaigns can fire", () => {
  it("never makes a paused campaign due", () => {
    const [state] = computeCampaignDueStates([campaign({ status: "paused" })], NOW);

    expect(state.isDue).toBe(false);
    expect(state.dueAt).toBeNull();
  });

  it("never makes a draft campaign due", () => {
    // A half-written campaign must not text anybody just because its date
    // arrived while the merchant was still editing it.
    const [state] = computeCampaignDueStates([campaign({ status: "draft" })], NOW);

    expect(state.isDue).toBe(false);
  });

  it("never makes an archived campaign due", () => {
    const [state] = computeCampaignDueStates([campaign({ status: "archived" })], NOW);

    expect(state.isDue).toBe(false);
  });

  it("still reports the campaign so the merchant sees it in the list", () => {
    const states = computeCampaignDueStates([campaign({ status: "paused" })], NOW);

    expect(states).toHaveLength(1);
    expect(states[0].campaignId).toBe("camp-1");
  });
});

describe("computeCampaignDueStates — repeating campaigns", () => {
  it("is due when an interval has elapsed since the last run", () => {
    const [state] = computeCampaignDueStates(
      [campaign({ lastRunAt: new Date("2026-08-01T02:00:00.000Z") })],
      NOW
    );

    expect(state.isDue).toBe(true);
  });

  it("is not due when the interval has not elapsed yet", () => {
    const [state] = computeCampaignDueStates(
      [campaign({ lastRunAt: new Date("2026-08-19T02:00:00.000Z") })],
      NOW
    );

    expect(state.isDue).toBe(false);
    expect(state.dueAt).not.toBeNull();
  });

  it("counts from the creation date when it has never run", () => {
    const [state] = computeCampaignDueStates(
      [campaign({ createdAt: new Date("2026-08-19T02:00:00.000Z"), lastRunAt: null })],
      NOW
    );

    expect(state.isDue).toBe(false);
  });

  it("reports how far overdue it is, so a stale campaign is visible", () => {
    const [state] = computeCampaignDueStates(
      [campaign({ lastRunAt: new Date("2026-07-01T02:00:00.000Z") })],
      NOW
    );

    expect(state.isDue).toBe(true);
    expect(state.overdueByMs).toBeGreaterThan(0);
  });

  it("reports zero overdue for a campaign that is not due", () => {
    const [state] = computeCampaignDueStates(
      [campaign({ lastRunAt: new Date("2026-08-19T02:00:00.000Z") })],
      NOW
    );

    expect(state.overdueByMs).toBe(0);
  });
});

describe("computeCampaignDueStates — one-off campaigns", () => {
  const oneOff = campaign({
    schedule: {
      scheduleKind: "one_off",
      scheduleTime: "10:00",
      scheduleDate: "2026-08-18",
      scheduleIntervalDays: null,
      scheduleWeekdays: [],
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
    },
  });

  it("is due once its date has arrived", () => {
    const [state] = computeCampaignDueStates([oneOff], NOW);

    expect(state.isDue).toBe(true);
  });

  it("never becomes due again after it has run", () => {
    // The single most damaging bug this module could have: a one-off that
    // re-fires texts the same guests the same message every poll.
    const [state] = computeCampaignDueStates(
      [{ ...oneOff, lastRunAt: new Date("2026-08-18T02:00:00.000Z") }],
      NOW
    );

    expect(state.isDue).toBe(false);
    expect(state.dueAt).toBeNull();
  });

  it("is not due before its date", () => {
    const [state] = computeCampaignDueStates(
      [oneOff],
      new Date("2026-08-17T02:00:00.000Z")
    );

    expect(state.isDue).toBe(false);
  });
});

describe("dueNow / nextUpcoming", () => {
  const ready = campaign({ id: "ready", lastRunAt: new Date("2026-07-01T02:00:00.000Z") });
  const waiting = campaign({ id: "waiting", lastRunAt: new Date("2026-08-19T02:00:00.000Z") });
  const paused = campaign({ id: "paused", status: "paused" });

  it("returns only the campaigns that can run right now", () => {
    const states = computeCampaignDueStates([ready, waiting, paused], NOW);

    expect(dueNow(states).map((s) => s.campaignId)).toEqual(["ready"]);
  });

  it("sorts the most overdue first, so the longest-waiting audience goes first", () => {
    const older = campaign({ id: "older", lastRunAt: new Date("2026-06-01T02:00:00.000Z") });
    const states = computeCampaignDueStates([ready, older], NOW);

    expect(dueNow(states)[0].campaignId).toBe("older");
  });

  it("names the soonest campaign still to come", () => {
    const states = computeCampaignDueStates([waiting, paused], NOW);

    expect(nextUpcoming(states)?.campaignId).toBe("waiting");
  });

  it("returns null when nothing is scheduled ahead", () => {
    const states = computeCampaignDueStates([paused], NOW);

    expect(nextUpcoming(states)).toBeNull();
  });

  it("handles an empty campaign list", () => {
    expect(computeCampaignDueStates([], NOW)).toEqual([]);
    expect(dueNow([])).toEqual([]);
    expect(nextUpcoming([])).toBeNull();
  });
});
