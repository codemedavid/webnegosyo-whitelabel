/**
 * Sending a campaign on the merchant's own say-so.
 *
 * Until now the only way to send was to wait: `dueRunId` is set only when the
 * schedule says the campaign is due, so a merchant who wrote a campaign and
 * wanted it to go out this afternoon had no button to press. "Send now" is that
 * button.
 *
 * Two things make it more than a shortcut past the gate.
 *
 * **The double-send.** `lastRunAt` is a run's `completed_at`, not its `due_at`.
 * So sending a one-off dated the 10th on the 3rd sets `lastRunAt` to the 3rd —
 * and `computeNextDueAt` then finds the 10th still ahead of it and fires the
 * campaign a SECOND time at the same guests. A one-off is therefore consumed by
 * a manual send. A recurring campaign is not: its next cycle is a genuinely
 * different occurrence.
 *
 * **Quiet hours still apply.** The guest-side rule in this domain has always
 * been unconditional — nobody is texted late at night, whatever the merchant
 * arranged. A manual button is exactly where that protection would otherwise be
 * lost, and a 2am marketing blast is how a merchant's SIM gets reported.
 */

import { decideSendNow, immediateRunAt, consumesCampaign } from "./send-now";
import type { SendNowInput } from "./send-now";

/** 2026-08-03T02:00:00Z is 10:00 Manila — comfortably inside the send window. */
const DAYTIME = new Date("2026-08-03T02:00:00.000Z");
/** 2026-08-03T18:00:00Z is 02:00 Manila — the middle of the night. */
const NIGHT = new Date("2026-08-03T18:00:00.000Z");

function input(overrides: Partial<SendNowInput> = {}): SendNowInput {
  return {
    platform: "android",
    isNew: false,
    isValid: true,
    status: "active",
    isRunning: false,
    recipientCount: 12,
    now: DAYTIME,
    quietHoursStart: "21:00",
    quietHoursEnd: "08:00",
    ...overrides,
  };
}

describe("decideSendNow — when the button works", () => {
  it("lets a saved, valid campaign with an audience send right now", () => {
    const decision = decideSendNow(input());

    expect(decision.canSend).toBe(true);
    expect(decision.block).toBeNull();
  });

  it("lets a DRAFT campaign send, because the merchant asked explicitly", () => {
    // The schedule only ever fires `active` — that rule is about a campaign
    // going out on its own. Pressing the button is not that.
    const decision = decideSendNow(input({ status: "draft" }));

    expect(decision.canSend).toBe(true);
  });

  it("lets a PAUSED campaign send", () => {
    // Pausing stops the schedule, not the merchant's own hand.
    expect(decideSendNow(input({ status: "paused" })).canSend).toBe(true);
  });

  it("sends inside quiet hours on the merchant's explicit say-so", () => {
    // Reversed 2026-08-03 at the merchant's request. Quiet hours still shift
    // every SCHEDULED send (`shiftOutOfQuietHours`); what changed is that a
    // human pressing the button at 1am is no longer overruled by it.
    const decision = decideSendNow(input({ now: NIGHT }));

    expect(decision.canSend).toBe(true);
    expect(decision.block).toBeNull();
  });

  it("still warns that it is quiet hours, naming when the window reopens", () => {
    // Not a block — a sentence in the confirmation, so a 1am blast is a choice
    // rather than an accident.
    const decision = decideSendNow(input({ now: NIGHT }));

    expect(decision.warning).not.toBeNull();
    expect(String(decision.warning)).toContain("08:00");
  });

  it("carries no warning during the day", () => {
    expect(decideSendNow(input()).warning).toBeNull();
  });
});

describe("decideSendNow — when it must not", () => {
  it("refuses on a platform that cannot send at all", () => {
    const decision = decideSendNow(input({ platform: "ios" }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("unsupported_platform");
  });

  it("refuses an unsaved campaign, which has no row to hang a run on", () => {
    const decision = decideSendNow(input({ isNew: true }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("unsaved");
  });

  it("refuses a campaign with validation errors", () => {
    // An unknown placeholder makes `renderMessage` throw per recipient. The
    // schedule already refuses to activate one of these; so does the button.
    const decision = decideSendNow(input({ isValid: false }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("invalid");
  });

  it("refuses an archived campaign, because archiving is how one is retired", () => {
    const decision = decideSendNow(input({ status: "archived" }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("archived");
  });

  it("refuses while a run is already in flight", () => {
    // Two overlapping runs of the same campaign is the double-send this whole
    // domain is built to avoid.
    const decision = decideSendNow(input({ isRunning: true }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("in_progress");
  });

  it("refuses when nobody matches the audience", () => {
    const decision = decideSendNow(input({ recipientCount: 0 }));

    expect(decision.canSend).toBe(false);
    expect(decision.block).toBe("no_audience");
  });

  it("reports the most fundamental blocker first", () => {
    // Everything wrong at once: the platform is the one worth saying, because
    // fixing any of the others would change nothing.
    const decision = decideSendNow(
      input({ platform: "ios", isNew: true, isValid: false, recipientCount: 0 })
    );

    expect(decision.block).toBe("unsupported_platform");
  });

  it("explains itself in the merchant's words, never a code", () => {
    for (const decision of [
      decideSendNow(input({ platform: "ios" })),
      decideSendNow(input({ isNew: true })),
      decideSendNow(input({ isValid: false })),
      decideSendNow(input({ status: "archived" })),
      decideSendNow(input({ isRunning: true })),
      decideSendNow(input({ recipientCount: 0 })),
    ]) {
      expect(decision.message.trim()).not.toBe("");
      expect(decision.message).not.toContain("_");
    }
  });
});

describe("immediateRunAt — one tap, one run", () => {
  it("quantizes to the minute, so a double-tap converges on a single run", () => {
    // `(campaign_id, due_at)` is unique. Without quantizing, two taps a second
    // apart create two run rows and text everybody twice.
    const first = immediateRunAt(new Date("2026-08-03T02:00:11.400Z"));
    const second = immediateRunAt(new Date("2026-08-03T02:00:47.900Z"));

    expect(first.toISOString()).toBe(second.toISOString());
  });

  it("starts a genuinely later tap on its own run", () => {
    const first = immediateRunAt(new Date("2026-08-03T02:00:11.000Z"));
    const later = immediateRunAt(new Date("2026-08-03T02:31:00.000Z"));

    expect(first.toISOString()).not.toBe(later.toISOString());
  });

  it("never dates a run in the future", () => {
    const now = new Date("2026-08-03T02:00:59.999Z");

    expect(immediateRunAt(now).getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe("consumesCampaign — the double-send guard", () => {
  it("consumes a one-off, whose scheduled date would otherwise fire again", () => {
    // `lastRunAt` is completed_at. Sending a one-off dated the 10th on the 3rd
    // leaves the 10th still ahead of the last run, so it fires a second time at
    // the same guests. That is the worst failure this feature has.
    expect(consumesCampaign("one_off")).toBe(true);
  });

  it("does not consume a recurring campaign", () => {
    // Its next cycle is a different occurrence the merchant still wants.
    expect(consumesCampaign("every_n_days")).toBe(false);
    expect(consumesCampaign("weekly")).toBe(false);
  });
});
