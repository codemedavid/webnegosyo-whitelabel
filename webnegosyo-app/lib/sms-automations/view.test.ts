import {
  activityStatusLabel,
  automationStatusLine,
  blockerFor,
  deliveryEtaText,
  readyToSetUp,
  renderSampleText,
  senderLine,
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
  updatedAt: "", stats: { waiting: 0, sent30d: 0, skipped30d: 0, lastSentAt: null }, ...overrides,
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
    expect(automationStatusLine(automation({ stats: { waiting: 3, sent30d: 12, skipped30d: 0, lastSentAt: null } }), view()))
      .toBe("On · 12 sent this month · 3 waiting");
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
    expect(sentenceFor("win_back", { inactiveDays: 45 })).toEqual({ before: "Text guests who haven’t ordered in", knob: "inactiveDays", unit: "days", after: "" });
    expect(sentenceFor("review_request", { delayHours: 3 })).toEqual({ before: "Ask for a review", knob: "delayHours", unit: "hours", after: "after an order" });
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
