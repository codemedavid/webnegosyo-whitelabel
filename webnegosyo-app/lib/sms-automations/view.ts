/**
 * Everything the Texts screens SAY, decided here so it is testable and the
 * screens stay layout. Plain words an owner reads at a glance: what each
 * automation did, the one thing blocking it, whether the phone can send, and
 * an honest "all out by" for a backlog.
 */

import type { Automation, AutomationParams, AutomationsView, OutboxStatus, ParamKey, RecipeId, RecipeInfo } from "./api";

const MANILA_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
const FEW_MINUTES_MS = 10 * 60_000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function manila(at: number): Date {
  return new Date(at + MANILA_OFFSET_MS);
}

function manilaDay(at: number): number {
  return Math.floor((at + MANILA_OFFSET_MS) / DAY_MS);
}

/** "2:30 PM", Manila wall time. */
export function clockText(at: number): string {
  const local = manila(at);
  const hours = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

function dateText(at: number): string {
  const local = manila(at);
  return `${DAYS[local.getUTCDay()]}, ${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type Blocker = { kind: "review_link" | "loyalty"; text: string };

/** The one thing that stops this recipe from running in this store, or null. */
export function blockerFor(recipe: RecipeId, view: AutomationsView): Blocker | null {
  const info = view.recipes.find((r) => r.id === recipe);
  if (info?.needsReviewLink && !view.settings.reviewUrl) return { kind: "review_link", text: "Add your review link to start" };
  if (info?.needsLoyalty && !view.loyaltyOn) return { kind: "loyalty", text: "Turn on Rewards to start" };
  return null;
}

/** The card's one line: what happened, or the one thing to fix. */
export function automationStatusLine(automation: Automation, view: AutomationsView): string {
  if (automation.status === "off") return "Off";
  const blocker = blockerFor(automation.recipe, view);
  if (blocker) return blocker.text;
  if (automation.runMode === "manual") return "Runs when you tap Run now";
  if (view.sender.enrolled === 0) return "Waiting for a sending phone";
  const { sent30d, waiting } = automation.stats;
  if (sent30d === 0 && waiting === 0) return "On · nothing sent yet";
  const parts = ["On"];
  if (sent30d > 0) parts.push(`${sent30d} sent this month`);
  if (waiting > 0) parts.push(`${waiting} waiting`);
  return parts.join(" · ");
}

/** Recipes the store has not set up, the ones that can run today first. */
export function readyToSetUp(view: AutomationsView): RecipeInfo[] {
  const taken = new Set(view.automations.map((a) => a.recipe));
  const open = view.recipes.filter((r) => !taken.has(r.id));
  return [...open.filter((r) => !blockerFor(r.id, view)), ...open.filter((r) => blockerFor(r.id, view))];
}

export type Tone = "good" | "warning";

export function senderLine(view: AutomationsView, now: number): { tone: Tone; text: string } {
  if (view.sender.enrolled === 0) return { tone: "warning", text: "No sending phone yet — texts can’t go out" };
  if (!view.sender.online) {
    const seen = view.sender.lastSeenAt ? Date.parse(view.sender.lastSeenAt) : NaN;
    if (!Number.isFinite(seen)) return { tone: "warning", text: "Phone offline — texts wait for it" };
    const since = manilaDay(seen) === manilaDay(now) ? clockText(seen) : dateText(seen);
    return { tone: "warning", text: `Phone offline since ${since} — texts wait for it` };
  }
  const parts = ["Phone online", `${view.outlook.sentToday} sent today`];
  if (view.outlook.waiting > 0) parts.push(`${view.outlook.waiting} waiting`);
  return { tone: "good", text: parts.join(" · ") };
}

/** "All out by 2:30 PM today" — assumes the phone stays on, which the sheet says. */
export function deliveryEtaText(finishAt: string | null, waiting: number, now: number): string {
  if (waiting <= 0) return "Nothing to send";
  const at = finishAt ? Date.parse(finishAt) : NaN;
  if (!Number.isFinite(at)) return "More than two weeks at your daily limit";
  if (at - now <= FEW_MINUTES_MS) return "All out within a few minutes";
  const days = manilaDay(at) - manilaDay(now);
  if (days === 0) return `All out by ${clockText(at)} today`;
  if (days === 1) return `All out by ${clockText(at)} tomorrow`;
  return `All out by ${dateText(at)}`;
}

export interface Sentence {
  before: string;
  knob: ParamKey;
  unit: string;
  after: string;
}

const SENTENCES: Record<RecipeId, Sentence> = {
  win_back: { before: "Text guests who haven’t ordered in", knob: "inactiveDays", unit: "days", after: "" },
  regulars_gone_quiet: { before: "Text regulars who haven’t ordered in", knob: "inactiveDays", unit: "days", after: "" },
  review_request: { before: "Ask for a review", knob: "delayHours", unit: "hours", after: "after an order" },
  first_visit_followup: { before: "Thank first-timers", knob: "delayDays", unit: "days", after: "after their first order" },
  loyalty_almost_there: { before: "Text guests with", knob: "remainingAtMost", unit: "stamps or fewer", after: "left to a reward" },
  loyalty_reward_waiting: { before: "Remind guests of an unused reward", knob: "delayDays", unit: "days", after: "after they earn it" },
  loyalty_reward_expiring: { before: "Remind guests", knob: "delayDays", unit: "days", after: "before a reward expires" },
};

/** The editor's headline knob, as a sentence the owner completes. */
export function sentenceFor(recipe: RecipeId, _params: AutomationParams): Sentence {
  return SENTENCES[recipe];
}

/** "1 day" / "3 days"; units that are phrases ("stamps or fewer") stay as they are. */
export function unitFor(value: number, unit: string): string {
  if (value === 1 && unit === "days") return "day";
  if (value === 1 && unit === "hours") return "hour";
  return unit;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function sampleValues(store: { storeName: string; baseUrl: string }): Record<string, string> {
  return {
    firstName: "Maria",
    name: "Maria Santos",
    storeName: store.storeName,
    orderCount: "4",
    totalSpent: "1250",
    lastOrderDate: "Sep 2, 2026",
    daysSinceLastOrder: "41",
    favoriteItem: "Spanish Latte",
    menuLink: `${store.baseUrl}/menu`,
    loyaltyLink: `${store.baseUrl}/loyalty`,
    reviewLink: "https://g.page/r/your-store",
    progressLeft: "2 stamps",
    stampsLeft: "2",
    rewardName: "Free Iced Tea",
    rewardExpiryDate: "Oct 20",
  };
}

/** The message as a guest would read it, with sample values; unknown words are listed, never blanked. */
export function renderSampleText(template: string, store: { storeName: string; baseUrl: string }): { text: string; unknown: string[] } {
  const values = sampleValues(store);
  const unknown: string[] = [];
  const text = template.replace(PLACEHOLDER, (match, name: string) => {
    if (values[name] !== undefined) return values[name];
    if (!unknown.includes(name)) unknown.push(name);
    return match;
  });
  return { text: text.trim(), unknown };
}

/** What each placeholder means, for the editor's word chips. */
export const VARIABLE_LABELS: Readonly<Record<string, string>> = {
  firstName: "First name",
  name: "Full name",
  storeName: "Store name",
  orderCount: "Orders so far",
  totalSpent: "Total spent",
  lastOrderDate: "Last order date",
  daysSinceLastOrder: "Days since last order",
  favoriteItem: "Favorite item",
  menuLink: "Menu link",
  loyaltyLink: "Rewards link",
  reviewLink: "Review link",
  progressLeft: "Stamps left (“2 stamps”)",
  stampsLeft: "Stamps left (number)",
  rewardName: "Reward",
  rewardExpiryDate: "Reward expiry date",
};

const STATUS_LABELS: Record<OutboxStatus, string> = {
  queued: "Waiting",
  claimed: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
  skipped: "Skipped",
};

export function activityStatusLabel(status: OutboxStatus): string {
  return STATUS_LABELS[status];
}

const REASONS: Readonly<Record<string, string>> = {
  no_consent: "Hasn’t agreed to texts",
  opted_out: "Opted out of texts",
  suppressed: "Number is blocked",
  no_phone: "No phone number",
  guest_changed: "Guest’s number changed",
  ordered: "Ordered again before it went out",
  reward_used: "Used the reward already",
  automation_off: "Automation was turned off",
  texted_recently: "Already got a text in the last few days",
  already_sent: "Already got this text",
  too_soon: "Got a similar text recently",
  missing_review_link: "No review link yet",
  cannot_fill: "Message couldn’t be filled in",
  expired: "The phone didn’t send it in time",
  owner_cancelled: "You cancelled it",
  unconfirmed: "The phone didn’t confirm it was sent",
  send_failed: "The phone couldn’t send it",
  delivery_failed: "The phone couldn’t send it",
  device_restarted: "The phone restarted while sending",
  invalid_message: "The text looked wrong, so it wasn’t sent",
  phone_stopped: "Sending was switched off",
};

export function skipReasonText(reason: string | null): string {
  return (reason && REASONS[reason]) || "Not sent";
}

/** "12 can get a text · 30 haven’t agreed to texts" for the editor's audience line. */
export function audienceText(audience: { withPhone: number; textable: number }): string {
  const cannot = audience.withPhone - audience.textable;
  const can = `${plural(audience.textable, "guest", "guests")} can get texts`;
  return cannot > 0 ? `${can} · ${cannot} haven’t agreed or opted out` : can;
}
