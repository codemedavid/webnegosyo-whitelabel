/**
 * The order screen's Messenger chat card.
 *
 * It must draw nothing for the orders that have no chat (most of them), say so
 * when the read failed instead of pretending there is no chat, and fall back to
 * the checkout name when Meta gave no Facebook name.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OrderChatCard } from "./OrderChatCard";
import type { ChatSession } from "../../lib/messenger-chat/chat";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

const mockUseOrderChats = jest.fn();
const mockUseChatThread = jest.fn();
const mockUseChatOrderRecords = jest.fn();
jest.mock("../../lib/messenger-chat/use-chats", () => ({
  useOrderChats: (orders: unknown) => mockUseOrderChats(orders),
  useChatThread: (sessionId: unknown) => mockUseChatThread(sessionId),
  useChatOrderRecords: (orders: unknown) => mockUseChatOrderRecords(orders),
}));

const NOW = Date.now();

const session: ChatSession = {
  id: "s1",
  psid: "123",
  firstName: "Ana",
  lastName: "Cruz",
  photoUrl: null,
  lastMessageAt: NOW - 60_000,
  lastMessagePreview: "Pa-extra sauce po",
  lastInboundAt: NOW - 60_000,
  botPausedUntil: null,
};

const order = {
  _id: "o1",
  _creationTime: NOW - 30 * 60_000,
  status: "preparing",
  customerName: "Table 4",
  customerData: { messenger_psid: "123" },
};

const idle = { isLoading: false, error: null, refetch: jest.fn() };

beforeEach(() => {
  mockPush.mockClear();
  mockUseChatOrderRecords.mockReturnValue({ byOrderId: new Map(), knownOrderIds: new Set(), refetch: jest.fn() });
  mockUseOrderChats.mockReturnValue({ ...idle, byOrderId: new Map([["o1", session]]) });
  mockUseChatThread.mockReturnValue({
    ...idle,
    thread: {
      session,
      hasOlder: false,
      messages: [
        { id: "m1", direction: "in", kind: "text", body: "Pa-order po", sentAt: NOW - 40 * 60_000 },
        { id: "m2", direction: "bot", kind: "card", body: "Sent the menu", sentAt: NOW - 39 * 60_000 },
        { id: "m3", direction: "staff", kind: "text", body: "Sige po", sentAt: NOW - 5 * 60_000 },
        { id: "m4", direction: "in", kind: "text", body: "Pa-extra sauce po", sentAt: NOW - 60_000 },
      ],
    },
  });
});

describe("OrderChatCard", () => {
  it("shows who wrote and the last three lines, and opens the chat", () => {
    render(<OrderChatCard order={order} />);
    expect(screen.getByText("Ana C.")).toBeTruthy();
    expect(screen.getByText("Wrote after ordering")).toBeTruthy();
    expect(screen.queryByText("Pa-order po")).toBeNull();
    expect(screen.getByText("Bot · Sent the menu")).toBeTruthy();
    expect(screen.getByText("Sige po")).toBeTruthy();
    expect(screen.getByText("Pa-extra sauce po")).toBeTruthy();

    fireEvent.press(screen.getByText("See chat"));
    expect(mockPush).toHaveBeenCalledWith("/(main)/chat/s1");
  });

  it("falls back to the checkout name when Meta gave no Facebook name", () => {
    mockUseOrderChats.mockReturnValue({ ...idle, byOrderId: new Map([["o1", { ...session, firstName: null, lastName: null }]]) });
    render(<OrderChatCard order={order} />);
    expect(screen.getByText("Table 4")).toBeTruthy();
  });

  it("draws nothing for an order that did not come from a chat", () => {
    render(<OrderChatCard order={{ ...order, customerData: { table_number: "4" } }} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("draws nothing when the chat is not readable by this account", () => {
    mockUseOrderChats.mockReturnValue({ ...idle, byOrderId: new Map() });
    render(<OrderChatCard order={order} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("says so and offers a retry when the read failed", () => {
    const refetch = jest.fn();
    mockUseOrderChats.mockReturnValue({ byOrderId: new Map(), isLoading: false, error: "boom", refetch });
    render(<OrderChatCard order={order} />);
    expect(screen.getByText("Could not load this customer's chat.")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("OrderChatCard — an order staff rang up for the chat", () => {
  const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
  const rungUp = {
    _id: "o9",
    _creationTime: NOW - 60_000,
    status: "pending",
    customerName: "Ana Cruz",
    customerData: { messenger_session_id: SESSION },
  };
  const record = { orderId: "o9", state: "waiting" as const, outcome: "sent", summarySentAt: NOW - 50_000, createdAt: NOW - 55_000 };

  beforeEach(() => {
    // The customer's Messenger id is not on the order yet: no chat by PSID.
    mockUseOrderChats.mockReturnValue({ ...idle, byOrderId: new Map() });
  });

  it("finds the chat by the id the register wrote, and says the customer has not confirmed", () => {
    mockUseChatOrderRecords.mockReturnValue({ byOrderId: new Map([["o9", record]]), knownOrderIds: new Set(["o9"]), refetch: jest.fn() });
    render(<OrderChatCard order={rungUp} />);
    expect(mockUseChatThread).toHaveBeenCalledWith(SESSION);
    expect(screen.getByText("Waiting for customer")).toBeTruthy();
    expect(screen.getByText(/confirm the order yourself/)).toBeTruthy();
    expect(screen.getByText("Sige po")).toBeTruthy();
  });

  it("tells staff when the customer asked for a change", () => {
    mockUseChatOrderRecords.mockReturnValue({
      byOrderId: new Map([["o9", { ...record, state: "change_requested" as const }]]),
      knownOrderIds: new Set(["o9"]),
      refetch: jest.fn(),
    });
    render(<OrderChatCard order={rungUp} />);
    expect(screen.getByText("Wants a change")).toBeTruthy();
  });

  it("still explains a summary that could not go out when the chat itself is not readable", () => {
    mockUseChatThread.mockReturnValue({ ...idle, thread: null });
    mockUseChatOrderRecords.mockReturnValue({
      byOrderId: new Map([["o9", { ...record, state: "not_sent" as const, outcome: "outside_window" }]]),
      knownOrderIds: new Set(["o9"]),
      refetch: jest.fn(),
    });
    render(<OrderChatCard order={rungUp} />);
    expect(screen.getByText("Couldn't send")).toBeTruthy();
    expect(screen.getByText(/24 hours/)).toBeTruthy();
    expect(screen.queryByText("See chat")).toBeNull();
  });

  it("says nothing about confirmation until the lookup came back", () => {
    render(<OrderChatCard order={{ ...rungUp, _creationTime: NOW - 10 * 60_000 }} />);
    expect(screen.queryByText("Couldn't send")).toBeNull();
  });

  // Review 2026-11-15: a chat order rung up offline read "Couldn't send" after two minutes.
  it("says a sale still on this phone goes once the phone is online, lookup or not", () => {
    render(<OrderChatCard order={{ ...rungUp, _creationTime: NOW - 10 * 60_000, offlineSync: "queued" }} />);
    expect(screen.getByText("Saved on this phone")).toBeTruthy();
    expect(screen.queryByText("Couldn't send")).toBeNull();
  });
});
