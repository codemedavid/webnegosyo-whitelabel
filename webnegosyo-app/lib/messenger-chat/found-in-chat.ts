/**
 * "Found in chat" (T2): the dishes a customer typed, matched against the
 * register's menu on the phone, so Make order starts from what they asked
 * for. Nothing leaves the phone and nothing is added without a tap; sizes and
 * add-ons are still picked by staff. Matching is the bot's own
 * (`typed-order.ts`, byte-identical to the web).
 */

import type { ChatMessage } from "./chat";
import { findDishes, type DishName, type FoundDish } from "./typed-order";

/** How far back to look: an order is a few lines, not yesterday's chat. */
const RECENT_LINES = 12;
const RECENT_MS = 6 * 60 * 60 * 1000;

/**
 * The dishes in the customer's recent lines, oldest mention first. A dish
 * named again keeps the NEWER quantity ("2 inasal… ay 3 pala").
 */
export function foundInChat(messages: readonly ChatMessage[], dishes: readonly DishName[], nowMs: number): FoundDish[] {
  const lines = messages
    .filter((message) => message.direction === "in" && message.kind === "text" && nowMs - message.sentAt <= RECENT_MS)
    .sort((a, b) => a.sentAt - b.sentAt)
    .slice(-RECENT_LINES);
  const byId = new Map<string, FoundDish>();
  for (const line of lines) {
    for (const dish of findDishes(line.body, dishes)) {
      byId.delete(dish.id);
      byId.set(dish.id, dish);
    }
  }
  return [...byId.values()];
}
