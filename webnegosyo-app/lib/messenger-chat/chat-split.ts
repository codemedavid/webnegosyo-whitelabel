/**
 * Taking an order for a chat on a phone (canvas 4a): the chat on top, the
 * register below, and a handle between them with three sizes. Pure.
 */

export const CHAT_SPLIT_SIZES = ["chat", "half", "menu"] as const;
export type ChatSplitSize = (typeof CHAT_SPLIT_SIZES)[number];

export const CHAT_SPLIT_LABELS: Record<ChatSplitSize, string> = {
  chat: "More chat",
  half: "Half",
  menu: "More menu",
};

/** Share of the screen the chat takes at each size. */
const SHARE: Record<ChatSplitSize, number> = { chat: 0.55, half: 0.36, menu: 0 };
/** "More menu" keeps the newest line or two on screen. */
export const CHAT_SPLIT_PEEK_HEIGHT = 92;
/** The register keeps at least this much below the chat. */
const REGISTER_MIN_HEIGHT = 260;

/** Height of the chat pane (above the handle) for a size and a window height. */
export function chatPaneHeight(size: ChatSplitSize, windowHeight: number): number {
  if (size === "menu") return CHAT_SPLIT_PEEK_HEIGHT;
  const wanted = Math.round(windowHeight * SHARE[size]);
  return Math.max(CHAT_SPLIT_PEEK_HEIGHT, Math.min(wanted, windowHeight - REGISTER_MIN_HEIGHT));
}

/** Newest lines the pane keeps above the register (older ones are one tap away in the chat). */
export const CHAT_PANE_LINES = 40;
/** "More menu" shows only the newest line or two. */
export const CHAT_PANE_PEEK_LINES = 2;

/** How many of the newest lines the pane shows: the tablet column always shows the full count. */
export function chatPaneLineLimit(size: ChatSplitSize | "column"): number {
  return size === "menu" ? CHAT_PANE_PEEK_LINES : CHAT_PANE_LINES;
}
