/**
 * Everything the Texts screens SAY, decided here so it is testable and the
 * screens stay layout. Plain words an owner reads at a glance: what each
 * automation did, the one thing blocking it, whether the phone can send, and
 * an honest "all out by" for a backlog.
 */

import type {
  Automation,
  AutomationsView,
  DeliveryOutlook,
  OutboxStatus,
  ParamKey,
  RecipeId,
  RecipeInfo,
  TextingRules,
} from "./api";
import { countSmsSegments } from "../sms/message-template";
import { estimateDeliveryFinish, PER_WINDOW, WINDOW_MINUTES } from "./eta";

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
  const isManual = automation.runMode === "manual";
  if (!isManual && view.sender.enrolled === 0) return "Waiting for a sending phone";
  const { sent30d, waiting, cameBack30d } = automation.stats;
  const lead = isManual ? "Runs when you tap Run now" : "On";
  if (sent30d === 0 && waiting === 0) return isManual ? lead : "On · nothing sent yet";
  const parts = [lead];
  if (sent30d > 0) parts.push(`${sent30d} sent in 30 days`);
  // The number an owner actually cares about: texted guests who ordered again.
  if (cameBack30d > 0) parts.push(`${cameBack30d} came back`);
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
export function sentenceFor(recipe: RecipeId): Sentence {
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

/** The store's web address for sample links; the server uses the store's real one. */
export function storeBaseUrl(slug: string | null): string {
  const clean = (slug ?? "").trim().toLowerCase();
  return clean ? `https://${clean}.webnegosyo.com` : "https://your-store.webnegosyo.com";
}

/** "21:00" → "9pm", "07:30" → "7:30am". */
export function hourText(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "9pm–8am". */
export function quietWindowText(rules: Pick<TextingRules, "quietHoursStart" | "quietHoursEnd">): string {
  return `${hourText(rules.quietHoursStart)}–${hourText(rules.quietHoursEnd)}`;
}

/** The pace promise every send sheet repeats, from the claim limits (eta.ts). */
export function pacingLine(rules: Pick<TextingRules, "quietHoursStart" | "quietHoursEnd">): string {
  return `Your phone sends about ${PER_WINDOW} every ${WINDOW_MINUTES} minutes, never ${quietWindowText(rules)}`;
}

/** A guest's number, never shown whole: "ending 4567". */
export function phoneEndingText(last4: string): string {
  return last4 ? `ending ${last4}` : "no number";
}

/** "1 text · 132 characters" — what one guest's message costs. */
export function segmentText(text: string): string {
  const count = countSmsSegments(text);
  const parts = count.segments === 0 ? "Empty" : plural(count.segments, "text", "texts");
  const chars = plural(count.length, "character", "characters");
  return count.encoding === "UCS2" ? `${parts} · ${chars} · emoji or symbols make it cost more` : `${parts} · ${chars}`;
}

/** The turn-on question, with the count that would actually be texted. */
export function turnOnQuestion(queued: number): { title: string; body: string } {
  if (queued <= 0) return { title: "No one qualifies right now", body: "Guests get this text as they qualify." };
  return {
    title: plural(queued, "guest already qualifies", "guests already qualify"),
    body: "Text them now too?",
  };
}

/** The top skip reasons from a preview, biggest first: "30 haven’t agreed to texts". */
export function topSkipReasons(skipped: Partial<Record<string, number>>, limit = 3): string[] {
  return Object.entries(skipped)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => `${count} · ${skipReasonText(reason)}`);
}

/** "just now", "5 min ago", "3 h ago", "Yesterday, 2:30 PM", "Mon, Oct 12". */
export function timeAgoText(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const diff = now - at;
  if (diff < 0) {
    const days = manilaDay(at) - manilaDay(now);
    if (days === 0) return `at ${clockText(at)}`;
    if (days === 1) return `tomorrow, ${clockText(at)}`;
    return dateText(at);
  }
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const days = manilaDay(now) - manilaDay(at);
  if (days === 0) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (days === 1) return `Yesterday, ${clockText(at)}`;
  return dateText(at);
}

/** The one-tap way out of a blocker, and why it is needed. */
export function blockerFix(blocker: Blocker): { label: string; why: string } {
  if (blocker.kind === "review_link") {
    return { label: "Add your review link", why: "This text sends guests to your review page, so it needs the link first." };
  }
  return { label: "Open Rewards", why: "This text is about stamps and rewards, so your rewards program needs to be on." };
}

export type SheetMode = "turn_on" | "run_now";

export interface SheetChoice {
  label: string;
  /** Also text the guests who already qualify. */
  sendBacklog: boolean;
  tone: "primary" | "secondary";
}

/** The confirm sheet's buttons for what the preview found, and a note when something is missing. */
export function sheetChoices(input: {
  mode: SheetMode;
  queued: number;
  hasSender: boolean;
  runMode: Automation["runMode"];
}): { choices: SheetChoice[]; note: string | null } {
  const { mode, queued, hasSender, runMode } = input;
  const noPhone = "To text them now, set up your sending phone first (Texts, Rules tab).";
  if (mode === "run_now") {
    if (queued <= 0) return { choices: [], note: null };
    if (!hasSender) return { choices: [], note: noPhone };
    return { choices: [{ label: `Text ${plural(queued, "guest", "guests")} now`, sendBacklog: true, tone: "primary" }], note: null };
  }
  if (queued <= 0) return { choices: [{ label: "Turn it on", sendBacklog: false, tone: "primary" }], note: null };
  const later = runMode === "manual" ? "Turn on, text them later" : "Turn on for new guests only";
  if (!hasSender) return { choices: [{ label: later, sendBacklog: false, tone: "primary" }], note: noPhone };
  return {
    choices: [
      { label: `Turn on and text ${queued} now`, sendBacklog: true, tone: "primary" },
      { label: later, sendBacklog: false, tone: "secondary" },
    ],
    note: null,
  };
}

/** What the sheet says once the server answered. */
export function sheetDoneText(mode: SheetMode, queued: number, eta: string): string {
  const waiting = `${plural(queued, "text is", "texts are")} waiting for your phone. ${eta}.`;
  if (mode === "run_now") return queued > 0 ? waiting : "Nothing new to send. Everyone who qualifies already got it.";
  return queued > 0 ? `It’s on. ${waiting}` : "It’s on. Guests get it as they qualify.";
}

/** "All out by …" for the queue as it would be after `extra` more texts. */
export function etaAfterQueueing(outlook: DeliveryOutlook, rules: TextingRules, extra: number, now: number): string {
  const waiting = outlook.waiting + Math.max(0, extra);
  const finish = estimateDeliveryFinish({ waiting, sentToday: outlook.sentToday, now, rules });
  return deliveryEtaText(finish === null ? null : new Date(finish).toISOString(), waiting, now);
}
