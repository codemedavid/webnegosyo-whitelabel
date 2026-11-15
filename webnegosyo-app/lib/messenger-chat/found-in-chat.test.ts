import { foundInChat } from "./found-in-chat";
import type { ChatMessage } from "./chat";

const NOW = Date.parse("2026-11-15T06:00:00Z");
const MENU = [
  { id: "inasal", name: "Chicken Inasal" },
  { id: "halo", name: "Halo-Halo" },
  { id: "coke", name: "Coke" },
];
const line = (id: string, body: string, minutesAgo: number, direction: ChatMessage["direction"] = "in"): ChatMessage =>
  ({ id, direction, kind: "text", body, sentAt: NOW - minutesAgo * 60_000 });

describe("foundInChat", () => {
  it("reads the dishes the customer typed, across lines", () => {
    expect(foundInChat([line("1", "pa order po 2 chicken inasal", 5), line("2", "tsaka 1 halo halo", 4)], MENU, NOW))
      .toEqual([{ id: "inasal", name: "Chicken Inasal", qty: 2 }, { id: "halo", name: "Halo-Halo", qty: 1 }]);
  });

  it("keeps the newer quantity when a dish is named again", () => {
    expect(foundInChat([line("1", "2 chicken inasal", 5), line("2", "ay 3 chicken inasal pala", 2)], MENU, NOW))
      .toEqual([{ id: "inasal", name: "Chicken Inasal", qty: 3 }]);
  });

  it("ignores the bot, staff, photos and old lines", () => {
    expect(foundInChat([
      line("1", "2 coke", 3, "bot"),
      line("2", "1 coke po", 3, "staff"),
      { ...line("3", "📷 Photo coke", 3), kind: "photo" },
      line("4", "2 coke", 7 * 60),
    ], MENU, NOW)).toEqual([]);
  });
});
