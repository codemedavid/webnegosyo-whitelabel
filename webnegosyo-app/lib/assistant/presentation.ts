/**
 * The Owl's words and small decisions, ported from the web panel
 * (src/components/admin/assistant/*) so both surfaces say the same thing.
 */

import type { AssistantChip, AssistantMessage, MessagePart, ToolPart, ToolResult } from "./types";

/** Characters an owner can type in one message (web: src/lib/assistant/limits.ts). */
export const MAX_INPUT_CHARS = 2000;

/** Menu photos one message can carry, and their size caps (web: src/lib/assistant/limits.ts). */
export const MAX_PHOTOS_PER_MESSAGE = 3;
export const MAX_PHOTO_DATA_URL_CHARS = 3_000_000;
export const MAX_PHOTOS_TOTAL_CHARS = 4_000_000;
/** What a photo-only message says, so the model knows what the owner wants. */
export const PHOTO_ONLY_TEXT = "Add the dishes in this photo to my menu.";

/** What the owner sees while a tool runs. */
export const TOOL_LABELS: Readonly<Record<string, string>> = {
  get_sales_overview: "Checking your sales…",
  get_menu_insights: "Looking at your menu…",
  search_menu: "Searching your menu…",
  get_best_times: "Checking your busy times…",
  get_item_pairs: "Looking at what’s ordered together…",
  get_customers: "Looking at your customers…",
  get_inventory: "Checking your stock…",
  get_boost_ideas: "Finding offer ideas…",
  get_staff_activity: "Checking staff activity…",
  propose_offer: "Preparing the offer…",
  propose_menu_item: "Preparing the new dish…",
  propose_stock_adjustment: "Preparing the stock update…",
  calc_promo_breakeven: "Working out the break-even…",
  suggest_promotions: "Looking for promotion ideas…",
  propose_sms_campaign: "Drafting the SMS…",
  propose_voucher: "Preparing the voucher…",
  get_orders_now: "Checking today’s orders…",
  get_live_offers: "Looking at your offers…",
  get_loyalty: "Checking your loyalty program…",
  get_sms_campaigns: "Checking your SMS campaigns…",
  get_vouchers: "Checking your vouchers…",
  propose_offer_change: "Preparing the offer change…",
  propose_cart_last_call: "Preparing the cart offer…",
  propose_loyalty_program: "Preparing the loyalty program…",
  propose_loyalty_status: "Preparing the loyalty change…",
  propose_pause_sms_campaign: "Preparing to pause the SMS…",
  propose_voucher_status: "Preparing the voucher change…",
  propose_menu_item_change: "Preparing the dish update…",
  propose_menu_from_photo: "Reading your photo… this takes a moment",
  propose_menu_import_edit: "Updating the dish list…",
};

export const WORKING_LABEL = "Working on it…";

export interface StarterGroup {
  title: string;
  prompts: string[];
}

export const STARTERS: readonly StarterGroup[] = [
  { title: "Sell more", prompts: ["How were sales this week?", "How many orders are waiting?", "When am I busiest?", "Give me offer ideas"] },
  { title: "Menu", prompts: ["Which dishes aren’t selling?", "What are my hidden gems?", "What do people order together?"] },
  { title: "Customers & team", prompts: ["Who are my best customers?", "How is my staff doing this week?"] },
  { title: "Promos", prompts: ["Suggest a promo for my quiet hours", "Can I afford 20% off my best seller?"] },
  { title: "Loyalty & offers", prompts: ["How is my loyalty program doing?", "Which offers are running?", "Which vouchers are being used?"] },
  { title: "Inventory", prompts: ["What stock is running low?"] },
];

/** A proposal's settled outcome, as the confirm card words it. */
export const CLOSED_TEXT: Readonly<Record<string, string>> = {
  cancelled: "Cancelled — nothing was changed.",
  expired: "This proposal expired. Ask again for a fresh one.",
  applied: "Done.",
  failed: "This change could not be made.",
  executing: "Being applied…",
};

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

export function toolNameOf(part: ToolPart): string {
  return part.type.slice("tool-".length);
}

export function asToolResult(output: unknown): ToolResult | null {
  return output && typeof output === "object" && "facts" in output ? (output as ToolResult) : null;
}

/** Every follow-up chip in a message, de-duplicated, at most four. */
export function collectChips(message: AssistantMessage): AssistantChip[] {
  const seen = new Set<string>();
  const chips: AssistantChip[] = [];
  for (const part of message.parts) {
    if (!isToolPart(part) || part.state !== "output-available") continue;
    for (const chip of asToolResult(part.output)?.chips ?? []) {
      if (seen.has(chip.prompt)) continue;
      seen.add(chip.prompt);
      chips.push(chip);
    }
  }
  return chips.slice(0, 4);
}

/** The text an owner typed, as one line. */
export function userTextOf(message: AssistantMessage): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [String((part as { text: unknown }).text ?? "")] : [])).join(" ");
}

/** Photos on a user message: the images this session, or only a count once reopened (the server never keeps the image). */
export function userPhotosOf(message: AssistantMessage): { urls: string[]; count: number } {
  const urls = message.parts.flatMap((part) => {
    const url = (part as { url?: unknown }).url;
    return part.type === "file" && typeof url === "string" ? [url] : [];
  });
  if (urls.length > 0) return { urls, count: urls.length };
  const marker = message.parts.find((part) => part.type === "data-photos") as { data?: { count?: unknown } } | undefined;
  const count = typeof marker?.data?.count === "number" ? marker.data.count : 0;
  return { urls: [], count };
}

/** The newest conversation id the server stamped on a message. */
export function conversationIdOf(messages: readonly AssistantMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index].metadata?.conversationId;
    if (typeof id === "string") return id;
  }
  return null;
}

export const NOT_ON_SERVER_ERROR = "Owl isn’t available on this server yet. Please try again after the next update.";

/**
 * The server's JSON refusal (`{ error }`), or a line that says what went wrong.
 * A 404 without our JSON means the web app serving this request has no Owl
 * routes at all (not deployed there yet) — not a generic failure.
 */
export function readRefusal(body: unknown, status?: number): string {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (typeof error === "string" && error.trim()) return error;
  return status === 404 ? NOT_ON_SERVER_ERROR : GENERIC_ERROR;
}

/** "Oct 6, 3:05 PM" — the past-chats list date. */
const DATE_LABEL = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function formatChatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? DATE_LABEL.format(new Date(time)) : "";
}
