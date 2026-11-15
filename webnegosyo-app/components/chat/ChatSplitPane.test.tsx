/**
 * The chat kept on screen while an order is rung up for it (canvas 4a / 4c):
 * the customer's lines are readable above the register, the handle changes how
 * much chat shows, and a tap on a line copies details onto the SAME sale.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChatSplitPane } from "./ChatSplitPane";
import { usePosCartStore } from "../../stores/pos-cart-store";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const refetch = jest.fn(async () => undefined);
const mockUseChatThread = jest.fn();
jest.mock("../../lib/messenger-chat/use-chats", () => ({
  useChatThread: (sessionId: unknown, options: unknown) => mockUseChatThread(sessionId, options),
}));

const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
const NOW = Date.now();
const thread = {
  session: { id: SESSION, psid: "123", firstName: "Ana", lastName: "Cruz", photoUrl: null, lastMessageAt: NOW, lastMessagePreview: null, lastInboundAt: NOW, botPausedUntil: null },
  hasOlder: false,
  messages: [
    { id: "m1", direction: "in", kind: "text", body: "pa order po 2 chicken inasal", sentAt: NOW - 4000 },
    { id: "m2", direction: "bot", kind: "text", body: "Sent the menu", sentAt: NOW - 3000 },
    { id: "m3", direction: "in", kind: "text", body: "0917 123 4567", sentAt: NOW - 2000 },
    { id: "m4", direction: "in", kind: "text", body: "pickup po 6pm", sentAt: NOW - 1000 },
  ],
};

beforeEach(() => {
  usePosCartStore.getState().reset();
  usePosCartStore.getState().setChat({ sessionId: SESSION, name: "Ana C." });
  mockUseChatThread.mockReturnValue({ thread, isLoading: false, isRefetching: false, error: null, refetch });
  refetch.mockClear();
});

const pane = (variant: "split" | "column" = "split") =>
  render(<ChatSplitPane variant={variant} sessionId={SESSION} name="Ana C." windowHeight={844} topInset={0} />);

describe("ChatSplitPane", () => {
  it("shows what the customer wrote above the register, and keeps it fresh", () => {
    pane();
    expect(screen.getByText("Chat with Ana C.")).toBeTruthy();
    expect(screen.getByText("pa order po 2 chicken inasal")).toBeTruthy();
    // Kept fresh by the query's own timer (paused in the background), not a
    // bare interval that ran on behind other tabs.
    expect(mockUseChatThread).toHaveBeenCalledWith(SESSION, { isLive: true });
  });

  it("More menu keeps only the newest lines; More chat brings the rest back", () => {
    pane();
    fireEvent.press(screen.getByText("More menu"));
    expect(screen.queryByText("pa order po 2 chicken inasal")).toBeNull();
    expect(screen.getByText("pickup po 6pm")).toBeTruthy();
    fireEvent.press(screen.getByText("More chat"));
    expect(screen.getByText("pa order po 2 chicken inasal")).toBeTruthy();
  });

  it("copies the customer's number onto the same sale from a tap", () => {
    pane();
    fireEvent.press(screen.getByText("0917 123 4567"));
    fireEvent.press(screen.getByText("Phone · 09171234567"));
    expect(usePosCartStore.getState().customerPhone).toBe("09171234567");
  });

  it("has no size handle as a tablet column", () => {
    pane("column");
    expect(screen.queryByText("More menu")).toBeNull();
    expect(screen.getByText("pa order po 2 chicken inasal")).toBeTruthy();
  });
});
