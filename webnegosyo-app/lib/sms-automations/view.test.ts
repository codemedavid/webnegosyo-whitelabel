import {
  activityStatusLabel,
  automationStatusLine,
  blockerFix,
  blockerFor,
  deliveryEtaText,
  etaAfterQueueing,
  hourText,
  pacingLine,
  phoneEndingText,
  segmentText,
  storeBaseUrl,
  timeAgoText,
  topSkipReasons,
  turnOnQuestion,
  readyToSetUp,
  renderSampleText,
  senderLine,
  sheetChoices,
  queuedWhenText,
  sheetDoneText,
  skipReasonText,
  sentenceFor,
} from "./view";
import type { Automation, AutomationsView, RecipeInfo } from "./api";

const NOW = Date.parse("2026-10-13T04:00:00Z"); // 12:00 Manila
const STORE = { storeName: "Kape", baseUrl: "https://kape.example" };

const recipe = (id: RecipeInfo["id"], overrides: Partial<RecipeInfo> = {}): RecipeInfo => ({
  id, moment: "bring_back", title: id, pitch: "p", defaults: {}, limits: {}, defaultReentryDays: 60,
  needsLoyalty: false, needsReviewLink: false, defaultMessage: "Hi {{firstName}}", defaultMessageTl: "Hi", variables: [],
  description: "d", ...overrides,
});

const automation = (overrides: Partial<Automation> = {}): Automation => ({
  id: "a1", recipe: "win_back", name: "We miss you", description: "Text guests who haven’t ordered in 30 days",
  params: { inactiveDays: 30 }, messageTemplate: "Hi", runMode: "auto", reentryDays: null, status: "on", source: "owner",
  updatedAt: "", stats: { waiting: 0, sent30d: 0, skipped30d: 0, cameBack30d: 0, lastSentAt: null }, ...overrides,
});

const view = (overrides: Partial<AutomationsView> = {}): AutomationsView => ({
  automations: [], recipes: [recipe("win_back"), recipe("review_request", { needsReviewLink: true }), recipe("loyalty_reward_waiting", { needsLoyalty: true })],
  settings: { quietHoursStart: "21:00", quietHoursEnd: "08:00", guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null },
  sender: { enrolled: 1, online: true, lastSeenAt: null },
  outlook: { waiting: 0, sentToday: 0, dailyLimit: 100, finishAt: null },
  loyaltyOn: true,
  ...overrides,
});

describe("automationStatusLine", () => {
  it("says what happened, not what the switch is", () => {
    expect(automationStatusLine(automation({ status: "off" }), view())).toBe("Off");
    expect(automationStatusLine(automation(), view())).toBe("On · nothing sent yet");
    expect(automationStatusLine(automation({ stats: { waiting: 3, sent30d: 12, skipped30d: 0, cameBack30d: 0, lastSentAt: null } }), view()))
      .toBe("On · 12 sent in 30 days · 3 waiting");
    expect(automationStatusLine(automation({ stats: { waiting: 0, sent30d: 12, skipped30d: 1, cameBack30d: 4, lastSentAt: null } }), view()))
      .toBe("On · 12 sent in 30 days · 4 ordered again");
    expect(automationStatusLine(automation({ runMode: "manual", stats: { waiting: 0, sent30d: 5, skipped30d: 0, cameBack30d: 0, lastSentAt: null } }), view()))
      .toBe("Runs when you tap Run now · 5 sent in 30 days");
    expect(automationStatusLine(automation({ runMode: "manual", status: "on" }), view())).toBe("Runs when you tap Run now");
  });

  it("puts what blocks it first", () => {
    expect(automationStatusLine(automation({ recipe: "review_request" }), view())).toBe("Add your review link to start");
    expect(automationStatusLine(automation(), view({ sender: { enrolled: 0, online: false, lastSeenAt: null } })))
      .toBe("Waiting for a sending phone");
  });
});

describe("blockerFor", () => {
  it("names the one thing to fix", () => {
    expect(blockerFor("review_request", view())).toEqual({ kind: "review_link", text: "Add your review link to start" });
    expect(blockerFor("loyalty_reward_waiting", view({ loyaltyOn: false }))).toEqual({ kind: "loyalty", text: "Turn on Rewards to start" });
    expect(blockerFor("win_back", view())).toBeNull();
  });
});

describe("readyToSetUp", () => {
  it("offers the recipes the store has not set up, runnable ones first", () => {
    const ids = readyToSetUp(view({ automations: [automation()] })).map((r) => r.id);
    expect(ids).toEqual(["loyalty_reward_waiting", "review_request"]);
  });
});

describe("senderLine", () => {
  it("tells the owner whether texts can go out", () => {
    expect(senderLine(view({ sender: { enrolled: 0, online: false, lastSeenAt: null } }), NOW))
      .toEqual({ tone: "warning", text: "No sending phone yet — texts can’t go out" });
    expect(senderLine(view({ outlook: { waiting: 4, sentToday: 9, dailyLimit: 100, finishAt: null } }), NOW))
      .toEqual({ tone: "good", text: "Phone online · 9 sent today · 4 waiting" });
    expect(senderLine(view({ sender: { enrolled: 1, online: false, lastSeenAt: "2026-10-13T02:00:00Z" } }), NOW))
      .toEqual({ tone: "warning", text: "Phone offline since 10:00 AM — texts wait for it" });
  });
});

describe("deliveryEtaText", () => {
  it("is honest about how long a backlog takes", () => {
    expect(deliveryEtaText(null, 0, NOW)).toBe("Nothing to send");
    expect(deliveryEtaText("2026-10-13T04:00:00Z", 10, NOW)).toBe("All out within a few minutes");
    expect(deliveryEtaText("2026-10-13T06:30:00Z", 60, NOW)).toBe("All out by 2:30 PM today");
    expect(deliveryEtaText("2026-10-14T00:30:00Z", 200, NOW)).toBe("All out by 8:30 AM tomorrow");
    expect(deliveryEtaText("2026-10-16T00:30:00Z", 900, NOW)).toBe("All out by Fri, Oct 16");
    expect(deliveryEtaText(null, 5000, NOW)).toBe("More than two weeks at your daily limit");
  });
});

describe("sentenceFor", () => {
  it("reads like a sentence with the knob in it", () => {
    expect(sentenceFor("win_back")).toEqual({ before: "Text guests who haven’t ordered in", knob: "inactiveDays", unit: "days", after: "" });
    expect(sentenceFor("review_request")).toEqual({ before: "Ask for a review", knob: "delayHours", unit: "hours", after: "after an order" });
  });
});

describe("renderSampleText", () => {
  it("fills every word with sample values and flags unknown ones", () => {
    expect(renderSampleText("Hi {{firstName}}, {{stampsLeft}} left at {{storeName}}! {{menuLink}}", STORE))
      .toEqual({ text: "Hi Maria, 2 left at Kape! https://kape.example/menu", unknown: [] });
    expect(renderSampleText("Hi {{nickname}}", STORE).unknown).toEqual(["nickname"]);
  });
});

describe("labels", () => {
  it("speaks plainly", () => {
    expect(activityStatusLabel("queued")).toBe("Waiting");
    expect(activityStatusLabel("sent")).toBe("Sent");
    expect(skipReasonText("texted_recently")).toBe("Already got a text in the last few days");
    expect(skipReasonText("ordered")).toBe("Ordered again before it went out");
    expect(skipReasonText("something_new")).toBe("Not sent");
  });
});

describe("sheet and feed wording", () => {
  it("names the store's address and the quiet window", () => {
    expect(storeBaseUrl("Kape-Tayo")).toBe("https://kape-tayo.webnegosyo.com");
    expect(storeBaseUrl(null)).toBe("https://your-store.webnegosyo.com");
    expect(hourText("21:00")).toBe("9pm");
    expect(hourText("07:30")).toBe("7:30am");
    expect(hourText("00:00")).toBe("12am");
    expect(pacingLine({ quietHoursStart: "21:00", quietHoursEnd: "08:00" }))
      .toBe("Your phone sends about 25 every 30 minutes, never 9pm–8am");
  });

  it("never shows a whole number", () => {
    expect(phoneEndingText("4567")).toBe("ending 4567");
  });

  it("counts what a message costs", () => {
    expect(segmentText("Hi Maria")).toBe("1 text · 8 characters");
    expect(segmentText("x".repeat(161))).toBe("2 texts · 161 characters");
    expect(segmentText("Hi 😀")).toMatch(/emoji or symbols make it cost more$/);
  });

  it("asks the turn-on question with the count that would be texted", () => {
    expect(turnOnQuestion(12)).toEqual({ title: "12 guests already qualify", body: "Text them now too?" });
    expect(turnOnQuestion(1).title).toBe("1 guest already qualifies");
    expect(turnOnQuestion(0).title).toBe("No one qualifies right now");
  });

  it("lists the biggest skip reasons first, in plain words", () => {
    expect(topSkipReasons({ no_consent: 30, ordered: 2, opted_out: 5, too_soon: 0, texted_recently: 1 }, 3))
      .toEqual(["30 · Hasn’t agreed to texts", "5 · Opted out of texts", "2 · Ordered again before it went out"]);
  });

  it("says when, relative to now", () => {
    expect(timeAgoText("2026-10-13T03:59:40Z", NOW)).toBe("just now");
    expect(timeAgoText("2026-10-13T03:55:00Z", NOW)).toBe("5 min ago");
    expect(timeAgoText("2026-10-13T01:00:00Z", NOW)).toBe("3 h ago");
    expect(timeAgoText("2026-10-12T06:30:00Z", NOW)).toBe("Yesterday, 2:30 PM");
    expect(timeAgoText("2026-10-10T06:30:00Z", NOW)).toBe("Sat, Oct 10");
    expect(timeAgoText("2026-10-13T06:30:00Z", NOW)).toBe("at 2:30 PM");
  });
});

describe("blockerFix", () => {
  it("offers the fix and says why", () => {
    expect(blockerFix({ kind: "review_link", text: "" }).label).toBe("Add your review link");
    expect(blockerFix({ kind: "loyalty", text: "" }).label).toBe("Open Rewards");
  });
});

describe("queuedWhenText", () => {
  it("says when a waiting text goes, and when it is overdue", () => {
    const now = Date.parse("2026-10-14T04:00:00Z"); // 12:00 Manila
    expect(queuedWhenText("2026-10-14T00:30:00Z", now)).toMatch(/^Due 3 h ago$/);
    expect(queuedWhenText("2026-10-14T06:00:00Z", now)).toMatch(/^Sends at /);
  });
});

describe("sheetChoices", () => {
  it("offers both ways to turn on when guests already qualify", () => {
    expect(sheetChoices({ mode: "turn_on", queued: 12, hasSender: true, runMode: "auto" }).choices.map((c) => [c.label, c.sendBacklog]))
      .toEqual([["Turn on for new guests only", false], ["Turn on and text 12 now", true]]);
  });

  it("leads with the safe choice and warns when the phone is offline", () => {
    const { choices, note } = sheetChoices({ mode: "turn_on", queued: 12, hasSender: true, isOnline: false, runMode: "auto" });
    expect(choices.map((c) => c.tone)).toEqual(["primary", "secondary"]);
    expect(note).toMatch(/offline/);
    expect(sheetChoices({ mode: "turn_on", queued: 0, hasSender: false, runMode: "auto" }).note).toMatch(/sending phone/);
  });

  it("only turns on, and says why, without a sending phone", () => {
    const { choices, note } = sheetChoices({ mode: "turn_on", queued: 12, hasSender: false, runMode: "auto" });
    expect(choices.map((c) => c.sendBacklog)).toEqual([false]);
    expect(note).toMatch(/sending phone/);
  });

  it("just turns on when nobody qualifies yet", () => {
    expect(sheetChoices({ mode: "turn_on", queued: 0, hasSender: true, runMode: "auto" }).choices.map((c) => c.label)).toEqual(["Turn it on"]);
  });

  it("runs now only when there is someone to text and a phone to text them", () => {
    expect(sheetChoices({ mode: "run_now", queued: 1, hasSender: true, runMode: "manual" }).choices.map((c) => c.label)).toEqual(["Text 1 guest now"]);
    expect(sheetChoices({ mode: "run_now", queued: 0, hasSender: true, runMode: "manual" }).choices).toEqual([]);
  });

  it("reports what happened", () => {
    expect(sheetDoneText("turn_on", 3, "All out by 2:30 PM today")).toBe("It’s on. 3 texts are waiting for your phone. All out by 2:30 PM today.");
    expect(sheetDoneText("turn_on", 0, "")).toBe("It’s on. Guests get it as they qualify.");
    expect(sheetDoneText("run_now", 1, "All out within a few minutes")).toBe("1 text is waiting for your phone. All out within a few minutes.");
  });
});

describe("etaAfterQueueing", () => {
  it("counts the texts about to be queued on top of what is waiting", () => {
    const rules = { quietHoursStart: "21:00", quietHoursEnd: "08:00", guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null };
    const outlook = { waiting: 10, sentToday: 0, dailyLimit: 100, finishAt: null };
    expect(etaAfterQueueing(outlook, rules, 0, NOW)).toBe("All out within a few minutes");
    expect(etaAfterQueueing(outlook, rules, 40, NOW)).toBe("All out by 12:30 PM today");
    expect(etaAfterQueueing({ ...outlook, waiting: 0 }, rules, 0, NOW)).toBe("Nothing to send");
  });
});
