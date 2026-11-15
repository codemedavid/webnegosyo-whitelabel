/**
 * The Chats list and one chat, rendered from the real screen files.
 *
 * What these pin: a customer without a Facebook name still has a label, bot
 * lines read as summaries rather than bubbles, the thread is read-only with a
 * way to the Page inbox, and an account that may not read chats is told so
 * instead of shown an empty list that looks like "no customers wrote".
 */
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ChatsScreen from "../../app/(main)/chats";
import ChatScreen from "../../app/(main)/chat/[sessionId]";
import type { ChatSession } from "../../lib/messenger-chat/chat";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchContextStore } from "../../stores/branch-context-store";
import { usePosCartStore } from "../../stores/pos-cart-store";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => {
  const actualReact = jest.requireActual("react");
  return {
    router: {
      push: (href: string) => mockPush(href),
      navigate: (href: string) => mockNavigate(href),
      replace: jest.fn(),
      back: jest.fn(),
    },
    useLocalSearchParams: () => ({ sessionId: "s1" }),
    // Focus happens once, after mount, as it does on a real screen.
    useFocusEffect: (effect: () => void | (() => void)) => actualReact.useEffect(effect, []),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../../lib/use-screen-top-inset", () => ({ useScreenTopInset: () => 0 }));
jest.mock("../../lib/messenger-chat/client", () => ({ platformChatDb: {} }));

const mockOpenExternalUrl = jest.fn();
jest.mock("../../lib/safe-url", () => ({ openExternalUrl: (url: string) => mockOpenExternalUrl(url) }));

const mockCanRead = jest.fn();
const mockUseChats = jest.fn();
const mockUseChatThread = jest.fn();
const mockCanMakeOrders = jest.fn();
const mockUseStaffChatTools = jest.fn();
jest.mock("../../lib/messenger-chat/use-chats", () => ({
  useCanReadChats: () => mockCanRead(),
  useCanMakeChatOrders: () => mockCanMakeOrders(),
  useChats: () => mockUseChats(),
  useChatThread: (sessionId: unknown) => mockUseChatThread(sessionId),
  useStaffChatTools: (sessionId: unknown) => mockUseStaffChatTools(sessionId),
}));

const mockSendStaffText = jest.fn();
const mockSetChatBotPaused = jest.fn();
const mockPreviewStaffCard = jest.fn();
const mockSendStaffCard = jest.fn();
jest.mock("../../lib/messenger-chat/staff-chat-service", () => ({
  sendStaffText: (...args: unknown[]) => mockSendStaffText(...args),
  setChatBotPaused: (...args: unknown[]) => mockSetChatBotPaused(...args),
  previewStaffCard: (...args: unknown[]) => mockPreviewStaffCard(...args),
  sendStaffCard: (...args: unknown[]) => mockSendStaffCard(...args),
}));

const NOW = Date.now();

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "s1",
    psid: "123",
    firstName: "Ana",
    lastName: "Cruz",
    photoUrl: null,
    lastMessageAt: NOW - 2 * 60_000,
    lastMessagePreview: "Pa-extra sauce po",
    lastInboundAt: NOW - 2 * 60_000,
    botPausedUntil: null,
    ...overrides,
  };
}

function openTools(extra: Record<string, unknown> = {}) {
  return {
    blocked: null,
    window: { isOpen: true, endsAt: NOW + 20 * 60 * 60_000 },
    bot: { enabled: true, pausedUntil: null, takeoverMinutes: 60 },
    cart: { count: 2, totalCentavos: 25500 },
    order: null,
    chips: [
      { card: "cart", label: "Send checkout · ₱255" },
      { card: "menu", label: "Menu" },
    ],
    ...extra,
  };
}

const idle = { isLoading: false, isRefetching: false, error: null, refetch: jest.fn(async () => undefined) };

beforeEach(() => {
  mockPush.mockClear();
  mockOpenExternalUrl.mockClear();
  mockCanRead.mockReturnValue({ canRead: true, tenantId: "t1" });
  mockNavigate.mockClear();
  mockCanMakeOrders.mockReturnValue(false);
  useAuthStore.setState({ tenantId: "t1" });
  mockUseStaffChatTools.mockReturnValue({ tools: openTools(), error: null, isLoading: false, refetch: jest.fn(async () => undefined) });
  mockSendStaffText.mockReset();
  mockSetChatBotPaused.mockReset();
  mockPreviewStaffCard.mockReset();
  mockSendStaffCard.mockReset();
  usePosCartStore.getState().reset();
  mockUseChats.mockReturnValue({
    ...idle,
    hasMore: false,
    chats: [
      { session: session(), order: { id: "o1", dailyNumber: 7, status: "preparing", createdAt: NOW - 30 * 60_000 } },
      {
        session: session({ id: "s2", firstName: null, lastName: null, lastMessagePreview: "Open pa po kayo?", botPausedUntil: NOW + 42 * 60_000 }),
        order: null,
      },
    ],
  });
  mockUseChatThread.mockReturnValue({
    ...idle,
    thread: {
      session: session(),
      hasOlder: false,
      messages: [
        { id: "m1", direction: "in", kind: "text", body: "Pa-order po", sentAt: NOW - 40 * 60_000 },
        { id: "m2", direction: "bot", kind: "card", body: "Sent the menu", sentAt: NOW - 39 * 60_000 },
        { id: "m3", direction: "staff", kind: "text", body: "Sige po", sentAt: NOW - 5 * 60_000 },
      ],
    },
  });
});

describe("Chats list", () => {
  it("lists conversations with the customer's latest order and opens one", () => {
    render(<ChatsScreen />);
    expect(screen.getByText("Ana C.")).toBeTruthy();
    expect(screen.getByText("Pa-extra sauce po")).toBeTruthy();
    expect(screen.getByText("#07 · Preparing")).toBeTruthy();

    fireEvent.press(screen.getByText("Ana C."));
    expect(mockPush).toHaveBeenCalledWith("/(main)/chat/s1");
  });

  it("labels a customer Meta gave no name for, and shows a paused bot", () => {
    render(<ChatsScreen />);
    expect(screen.getByText("Messenger customer")).toBeTruthy();
    expect(screen.getByText("Bot paused · 42 min")).toBeTruthy();
  });

  it("says why when this account may not read chats", () => {
    mockCanRead.mockReturnValue({ canRead: false, tenantId: "t1" });
    render(<ChatsScreen />);
    expect(screen.getByText("Chats aren't available here")).toBeTruthy();
    expect(screen.queryByText("Ana C.")).toBeNull();
  });

  it("puts customers waiting for a person on top with how long they have waited", () => {
    mockUseChats.mockReturnValue({
      ...idle,
      hasMore: false,
      chats: [
        { session: session(), order: null },
        { session: session({ id: "s3", firstName: "Ben", lastName: null, needsReplySince: NOW - 12 * 60_000 }), order: null },
      ],
    });
    render(<ChatsScreen />);
    expect(screen.getByText("customer is waiting for a person")).toBeTruthy();
    expect(screen.getByText("Needs a reply · 12 min")).toBeTruthy();
    const names = screen.getAllByText(/^(Ben|Ana C\.)$/).map((node) => node.props.children);
    expect(names).toEqual(["Ben", "Ana C."]);
  });

  it("is honest about an empty inbox", () => {
    mockUseChats.mockReturnValue({ ...idle, hasMore: false, chats: [] });
    render(<ChatsScreen />);
    expect(screen.getByText("No chats yet")).toBeTruthy();
  });
});

describe("Chat screen", () => {
  it("shows the thread, the latest order and a way to reply from the inbox", () => {
    render(<ChatScreen />);
    expect(screen.getByText("Ana C.")).toBeTruthy();
    expect(screen.getByText("Messenger · Bot on")).toBeTruthy();
    expect(screen.getByText("Pa-order po")).toBeTruthy();
    expect(screen.getByText("Bot · Sent the menu")).toBeTruthy();
    expect(screen.getByText("Sige po")).toBeTruthy();

    fireEvent.press(screen.getByText("#07"));
    expect(mockPush).toHaveBeenCalledWith("/(main)/order/o1");

    fireEvent.press(screen.getByText("Reply in Business Suite"));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://business.facebook.com/latest/inbox/all");
  });

  it("says the chat is not there when this account may not read it", () => {
    mockUseChatThread.mockReturnValue({ ...idle, thread: null });
    render(<ChatScreen />);
    expect(screen.getByText("Chat not found")).toBeTruthy();
  });

  it("offers a retry when the chat could not be loaded", () => {
    const refetch = jest.fn(async () => undefined);
    mockUseChatThread.mockReturnValue({ ...idle, thread: undefined, error: "The chat could not be loaded.", refetch });
    render(<ChatScreen />);
    expect(screen.getByText("The chat could not be loaded.")).toBeTruthy();
  });
});

describe("Chat screen — Make order", () => {
  it("is not offered to an account that may not ring up chat orders", () => {
    render(<ChatScreen />);
    expect(screen.queryByText("Make order")).toBeNull();
    expect(screen.getByText("You can read the chat here. Replies are sent from your Page inbox.")).toBeTruthy();
  });

  it("opens the register for this customer, with their Facebook name filled in", () => {
    mockCanMakeOrders.mockReturnValue(true);
    render(<ChatScreen />);
    fireEvent.press(screen.getByText("Make order"));

    const register = usePosCartStore.getState();
    expect(register.chat).toEqual({ sessionId: "s1", name: "Ana C.", note: "" });
    expect(register.customerName).toBe("Ana Cruz");
    expect(mockNavigate).toHaveBeenCalledWith("/(main)/pos");
  });

  // Found on a simulator walk: an owner looking at every branch reached the
  // register, tapped a dish and got "Choose a branch" with nowhere to go.
  it("sends a store-wide account to pick a branch first, keeping the order ready", () => {
    mockCanMakeOrders.mockReturnValue(true);
    useAuthStore.setState({ outletId: null });
    useBranchContextStore.setState({ selectedOutletId: null, selectedOutletName: null, knownOutletIds: ["b1", "b2"] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    render(<ChatScreen />);
    fireEvent.press(screen.getByText("Make order"));

    expect(alert).toHaveBeenCalledWith("Which branch is this order for?", expect.stringContaining("Ana C."), expect.any(Array));
    expect(mockNavigate).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((button) => button.text === "Choose branch")?.onPress?.();
    expect(usePosCartStore.getState().chat?.sessionId).toBe("s1");
    expect(mockNavigate).toHaveBeenCalledWith("/(main)/portfolio");
    alert.mockRestore();
    useBranchContextStore.setState({ knownOutletIds: null });
  });

  it("goes straight to the register once a branch is open", () => {
    mockCanMakeOrders.mockReturnValue(true);
    useAuthStore.setState({ outletId: null });
    useBranchContextStore.setState({ selectedOutletId: "b1", selectedOutletName: "Main", knownOutletIds: ["b1", "b2"] });

    render(<ChatScreen />);
    fireEvent.press(screen.getByText("Make order"));

    expect(mockNavigate).toHaveBeenCalledWith("/(main)/pos");
    useBranchContextStore.setState({ selectedOutletId: null, selectedOutletName: null, knownOutletIds: null });
  });

  it("asks before replacing a sale already on the counter", () => {
    mockCanMakeOrders.mockReturnValue(true);
    usePosCartStore.getState().add({ menuItemId: "m1", name: "Latte", basePrice: 150, quantity: 1, selections: [] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    render(<ChatScreen />);
    fireEvent.press(screen.getByText("Make order"));

    expect(alert).toHaveBeenCalledWith("Clear the register?", expect.stringContaining("Ana C."), expect.any(Array));
    // Nothing moved until the cashier answers.
    expect(usePosCartStore.getState().chat).toBeNull();
    expect(usePosCartStore.getState().lines).toHaveLength(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((button) => button.text === "Start this order")?.onPress?.();
    expect(usePosCartStore.getState().chat?.sessionId).toBe("s1");
    expect(usePosCartStore.getState().lines).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith("/(main)/pos");
    alert.mockRestore();
  });
});

describe("Chat screen — replying from the app", () => {
  beforeEach(() => mockCanMakeOrders.mockReturnValue(true));

  it("sends a typed reply and shows it on its way", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockSendStaffText.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ChatScreen />);

    fireEvent.changeText(screen.getByLabelText("Reply to the customer"), "  Ready na po!  ");
    fireEvent.press(screen.getByLabelText("Send reply"));

    expect(mockSendStaffText).toHaveBeenCalledWith({ tenantId: "t1", sessionId: "s1" }, expect.stringMatching(/^app_/), "Ready na po!");
    expect(screen.getByText("Ready na po!")).toBeTruthy();
    expect(screen.getByText("Sending…")).toBeTruthy();
    await act(async () => finish({ ok: true, value: { alreadySent: false, pausedUntil: null } }));
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("keeps a failed reply with a retry that reuses the same tap", async () => {
    mockSendStaffText.mockResolvedValueOnce({ ok: false, error: "Messenger didn't take it. Try again." });
    render(<ChatScreen />);
    fireEvent.changeText(screen.getByLabelText("Reply to the customer"), "Ready na po!");
    fireEvent.press(screen.getByLabelText("Send reply"));
    await waitFor(() => expect(screen.getByText("Messenger didn't take it. Try again.")).toBeTruthy());

    mockSendStaffText.mockResolvedValueOnce({ ok: true, value: { alreadySent: false, pausedUntil: null } });
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("Sent")).toBeTruthy());
    expect(mockSendStaffText.mock.calls[1][1]).toBe(mockSendStaffText.mock.calls[0][1]);
  });

  it("previews a quick action and sends it only on Send", async () => {
    mockPreviewStaffCard.mockResolvedValue({ ok: true, value: [{ kind: "buttons", text: "Your cart · 2 items", buttons: [{ title: "Checkout" }] }] });
    mockSendStaffCard.mockResolvedValue({ ok: true, value: { alreadySent: false, pausedUntil: null } });
    render(<ChatScreen />);

    fireEvent.press(screen.getByText("Send checkout · ₱255"));
    await waitFor(() => expect(screen.getByText("Your cart · 2 items")).toBeTruthy());
    expect(mockSendStaffCard).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Send to Ana C."));
    await waitFor(() => expect(mockSendStaffCard).toHaveBeenCalledWith({ tenantId: "t1", sessionId: "s1" }, expect.stringMatching(/^app_/), "cart", undefined));
  });

  it("locks the reply box after 24 hours and points to Business Suite", () => {
    mockUseStaffChatTools.mockReturnValue({
      tools: openTools({ window: { isOpen: false, endsAt: NOW - 60_000 }, chips: [] }),
      error: null, isLoading: false, refetch: jest.fn(),
    });
    render(<ChatScreen />);
    expect(screen.queryByLabelText("Reply to the customer")).toBeNull();
    expect(screen.getByText(/over 24 hours/)).toBeTruthy();
    fireEvent.press(screen.getByText("Reply in Business Suite"));
    expect(mockOpenExternalUrl).toHaveBeenCalled();
  });

  it("pauses the bot from the header", async () => {
    mockSetChatBotPaused.mockResolvedValue({ ok: true, value: { alreadySent: false, pausedUntil: NOW + 3600_000 } });
    render(<ChatScreen />);
    fireEvent.press(screen.getByLabelText("Pause bot"));
    await waitFor(() => expect(mockSetChatBotPaused).toHaveBeenCalledWith({ tenantId: "t1", sessionId: "s1" }, true));
  });
});
