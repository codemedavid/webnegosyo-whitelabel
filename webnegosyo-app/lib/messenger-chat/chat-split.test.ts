import {
  CHAT_PANE_LINES,
  CHAT_PANE_PEEK_LINES,
  CHAT_SPLIT_PEEK_HEIGHT,
  CHAT_SPLIT_SIZES,
  chatPaneHeight,
  chatPaneLineLimit,
} from "./chat-split";

describe("chat split on a phone", () => {
  it("gives the chat more, half or a peek, in that order", () => {
    const heights = CHAT_SPLIT_SIZES.map((size) => chatPaneHeight(size, 844));
    expect(heights).toEqual([464, 304, CHAT_SPLIT_PEEK_HEIGHT]);
  });

  it("always leaves the register room on a short screen", () => {
    expect(chatPaneHeight("chat", 568)).toBe(308);
    expect(chatPaneHeight("chat", 300)).toBe(CHAT_SPLIT_PEEK_HEIGHT);
  });

  it("shows only the newest lines when the menu has the screen", () => {
    expect(chatPaneLineLimit("menu")).toBe(CHAT_PANE_PEEK_LINES);
    expect(chatPaneLineLimit("half")).toBe(CHAT_PANE_LINES);
    expect(chatPaneLineLimit("chat")).toBe(CHAT_PANE_LINES);
  });

  it("gives the tablet column the full count whatever size was picked on a phone", () => {
    expect(chatPaneLineLimit("column")).toBe(CHAT_PANE_LINES);
  });
});
