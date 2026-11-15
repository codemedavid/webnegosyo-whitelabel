/**
 * Replying to a Messenger customer from the app (web plan
 * `docs/plans/2026-11-15-messenger-reply-from-app.md`, C4). Pure: the shapes
 * `POST /api/messenger/chat` answers with, the messages waiting to show up in
 * the chat log, and the words the chat screen uses for the reply window and
 * the bot switch. The calls are in `staff-chat-service.ts`.
 */

import type { ChatMessage } from "./chat";

/** The web route's cap (the chat log keeps 1,000 characters a line). */
export const STAFF_TEXT_MAX = 1000;

export type StaffCard = "menu" | "categories" | "hours" | "cart" | "order_status" | "summary" | "pay";

export interface StaffChip {
  card: StaffCard;
  label: string;
  orderId?: string;
}

export type StaffChatBlock = "not_platform" | "no_page";

export interface StaffChatTools {
  /** Nothing can be sent from this store at all, and why. */
  blocked: StaffChatBlock | null;
  window: { isOpen: boolean; endsAt: number | null };
  bot: { enabled: boolean; pausedUntil: number | null; takeoverMinutes: number };
  cart: { count: number; totalCentavos: number } | null;
  order: { id: string; label: string; status: string; isPaid: boolean; isChatOrder: boolean } | null;
  chips: StaffChip[];
}

/** One message as the bot would send it (the web's `OutgoingMessage`), for the preview. */
export type PreviewMessage =
  | { kind: "text"; text: string; quickReplies?: Array<{ title: string }> }
  | { kind: "buttons"; text: string; buttons: Array<{ title: string }>; quickReplies?: Array<{ title: string }> }
  | { kind: "cards"; cards: Array<{ title: string; subtitle?: string; imageUrl?: string; buttons?: Array<{ title: string }> }>; quickReplies?: Array<{ title: string }> };

const ms = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const CARDS: readonly StaffCard[] = ["menu", "categories", "hours", "cart", "order_status", "summary", "pay"];

/** The `tools` answer, read defensively: a field the server didn't send is "not there", never a crash. */
export function parseStaffChatTools(body: unknown): StaffChatTools | null {
  if (!isRecord(body) || !isRecord(body.window) || !isRecord(body.bot)) return null;
  const chips = Array.isArray(body.chips)
    ? body.chips.flatMap((chip): StaffChip[] => {
        if (!isRecord(chip) || typeof chip.label !== "string" || !CARDS.includes(chip.card as StaffCard)) return [];
        return [{ card: chip.card as StaffCard, label: chip.label, ...(typeof chip.orderId === "string" ? { orderId: chip.orderId } : {}) }];
      })
    : [];
  const cart = isRecord(body.cart) && typeof body.cart.count === "number"
    ? { count: body.cart.count, totalCentavos: Number(body.cart.totalCentavos) || 0 }
    : null;
  const order = isRecord(body.order) && typeof body.order.id === "string"
    ? {
        id: body.order.id,
        label: String(body.order.label ?? ""),
        status: String(body.order.status ?? ""),
        isPaid: body.order.isPaid === true,
        isChatOrder: body.order.isChatOrder === true,
      }
    : null;
  return {
    blocked: body.blocked === "not_platform" || body.blocked === "no_page" ? body.blocked : null,
    window: { isOpen: body.window.isOpen === true, endsAt: ms(body.window.endsAt) },
    bot: {
      enabled: body.bot.enabled !== false,
      pausedUntil: ms(body.bot.pausedUntil),
      takeoverMinutes: Number(body.bot.takeoverMinutes) || 0,
    },
    cart,
    order,
    chips,
  };
}

// ── Replies on their way ─────────────────────────────────────────────────────

export interface PendingReply {
  clientId: string;
  text: string;
  /** When Send was tapped (epoch ms). */
  createdAt: number;
  status: "sending" | "sent" | "failed";
  error?: string;
}

/** A short random id for one tap of Send; a retry of the same tap reuses it. */
export function newClientId(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "app_";
  for (let index = 0; index < 16; index += 1) id += alphabet[Math.floor(random() * alphabet.length)];
  return id;
}

/** Allows for the server's clock being a little behind the phone's. */
const CLOCK_SLACK_MS = 60_000;

/**
 * Sent replies stay on screen until the chat log shows them: a staff line with
 * the same words, written after Send was tapped. Failed ones stay until retried
 * or dismissed; nothing is dropped silently.
 */
export function stillPending(pending: readonly PendingReply[], messages: readonly ChatMessage[]): PendingReply[] {
  const logged = messages.filter((message) => message.direction === "staff");
  const used = new Set<string>();
  return pending.filter((reply) => {
    if (reply.status !== "sent") return true;
    const match = logged.find(
      (message) => !used.has(message.id) && message.body === reply.text.trim() && message.sentAt >= reply.createdAt - CLOCK_SLACK_MS,
    );
    if (!match) return true;
    used.add(match.id);
    return false;
  });
}

// ── Words on the chat screen ─────────────────────────────────────────────────

function span(minutes: number): string {
  if (minutes >= 120) return `${Math.round(minutes / 60)} h`;
  if (minutes >= 60) return "1 h";
  return `${Math.max(1, minutes)} min`;
}

/**
 * How long the store can still reply. Shown only once it gets short, so the
 * composer isn't covered in a countdown most of the day.
 */
export function windowNote(tools: Pick<StaffChatTools, "window">, nowMs: number): string | null {
  const endsAt = tools.window.endsAt;
  if (!tools.window.isOpen || endsAt === null) return null;
  const minutes = Math.ceil((endsAt - nowMs) / 60_000);
  if (minutes > 3 * 60) return null;
  return `You can reply for ${span(minutes)} more. After that, Messenger only allows a reply in Business Suite.`;
}

export interface BotSwitch {
  isPaused: boolean;
  /** The header's state line. */
  label: string;
  /** What tapping the switch does. */
  actionLabel: string;
}

export function botSwitch(tools: Pick<StaffChatTools, "bot"> | null, fallbackPausedUntil: number | null, nowMs: number): BotSwitch {
  if (tools && !tools.bot.enabled) return { isPaused: true, label: "Bot is off for the store", actionLabel: "" };
  const until = tools ? tools.bot.pausedUntil : fallbackPausedUntil;
  if (until !== null && until > nowMs) {
    return { isPaused: true, label: `Bot paused · ${span(Math.ceil((until - nowMs) / 60_000))}`, actionLabel: "Turn bot back on" };
  }
  return { isPaused: false, label: "Bot on", actionLabel: "Pause bot" };
}

const BLOCK_WORDS: Record<StaffChatBlock, string> = {
  not_platform: "Replying from the app works for stores on WebNegosyo orders only.",
  no_page: "Your Facebook Page is not connected. Connect it in Settings → Messenger on the web.",
};

/** Why the composer is locked, or null when the store can reply. */
export function lockReason(tools: StaffChatTools | null): string | null {
  if (!tools) return null;
  if (tools.blocked) return BLOCK_WORDS[tools.blocked];
  if (!tools.window.isOpen) {
    return tools.window.endsAt === null
      ? "They haven't written to the Page yet, so Messenger doesn't let the store write first."
      : "It's been over 24 hours since their last message. Messenger only allows a reply in Business Suite now.";
  }
  return null;
}

/** One line per preview message, for screen readers and tests. */
export function describePreview(messages: readonly PreviewMessage[]): string[] {
  return messages.map((message) => {
    if (message.kind === "cards") return message.cards.map((card) => card.title).join(" · ");
    return message.text;
  });
}
