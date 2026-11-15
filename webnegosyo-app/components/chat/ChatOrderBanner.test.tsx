/**
 * "Ordering for Ana C." on the register, and the chat sheet behind it.
 *
 * What these pin: an ordinary sale shows no banner; a phone number the
 * customer typed is one tap onto the sale; any line they wrote can become the
 * name, the address or the note; nothing the bot or staff said is offered; and
 * "Not for this chat" turns the sale back into an ordinary one without
 * emptying the cart.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ChatOrderBanner } from "./ChatOrderBanner";
import { usePosCartStore } from "../../stores/pos-cart-store";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseChatThread = jest.fn();
jest.mock("../../lib/messenger-chat/use-chats", () => ({
  useChatThread: (sessionId: unknown) => mockUseChatThread(sessionId),
}));

const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
const NOW = Date.now();
const idle = { isLoading: false, isRefetching: false, error: null, refetch: jest.fn(async () => undefined) };

const thread = {
  session: {
    id: SESSION,
    psid: "123",
    firstName: "Ana",
    lastName: "Cruz",
    photoUrl: null,
    lastMessageAt: NOW,
    lastMessagePreview: null,
    lastInboundAt: NOW,
    botPausedUntil: null,
  },
  hasOlder: false,
  messages: [
    { id: "m1", direction: "in", kind: "text", body: "2 chicken joy po, no gravy", sentAt: NOW - 5000 },
    { id: "m2", direction: "bot", kind: "card", body: "Sent the menu", sentAt: NOW - 4000 },
    { id: "m3", direction: "staff", kind: "text", body: "Ano pong number nyo? 09179999999 kami", sentAt: NOW - 3000 },
    { id: "m4", direction: "in", kind: "text", body: "0917 123 4567", sentAt: NOW - 2000 },
    { id: "m5", direction: "in", kind: "text", body: "Blk 4 Lot 12 Sampaguita St", sentAt: NOW - 1000 },
  ],
};

const register = () => usePosCartStore.getState();

beforeEach(() => {
  register().reset();
  // No thread until the sheet asks for one, as on the real screen.
  mockUseChatThread.mockImplementation((sessionId: unknown) => ({ ...idle, thread: sessionId ? thread : undefined }));
});

describe("ChatOrderBanner", () => {
  it("draws nothing for an ordinary sale", () => {
    render(<ChatOrderBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it("names who the order is for and does not read the chat until it is opened", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner />);
    expect(screen.getByText("Ordering for Ana C.")).toBeTruthy();
    expect(screen.getByText("From Messenger · sent to them to confirm")).toBeTruthy();
    expect(mockUseChatThread).toHaveBeenLastCalledWith(null);
  });

  it("explains on the payment screen what sending does", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner variant="tender" />);
    expect(screen.getByText(/They get this order in Messenger to confirm/)).toBeTruthy();
  });

  it("turns back into an ordinary sale without emptying the cart", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    register().add({ menuItemId: "m1", name: "Latte", basePrice: 150, quantity: 1, selections: [] });
    render(<ChatOrderBanner />);
    fireEvent.press(screen.getByText("Not for this chat"));
    expect(register().chat).toBeNull();
    expect(register().lines).toHaveLength(1);
  });
});

describe("the chat beside the sale", () => {
  function openChat() {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner />);
    fireEvent.press(screen.getByText("View chat"));
  }

  it("offers the Facebook name and the customer's own number as one tap each", () => {
    openChat();
    expect(mockUseChatThread).toHaveBeenCalledWith(SESSION);
    expect(screen.getByText("Name · Ana Cruz")).toBeTruthy();
    expect(screen.getByText("Phone · 09171234567")).toBeTruthy();
    // The number staff typed is not the customer's.
    expect(screen.queryByText("Phone · 09179999999")).toBeNull();

    fireEvent.press(screen.getByText("Phone · 09171234567"));
    expect(register().customerPhone).toBe("09171234567");
    expect(screen.getByText("Phone number filled in.")).toBeTruthy();

    fireEvent.press(screen.getByText("Name · Ana Cruz"));
    expect(register().customerName).toBe("Ana Cruz");
  });

  it("lets a line the customer wrote become the order's note", () => {
    openChat();
    fireEvent.press(screen.getByLabelText("Use this message: 2 chicken joy po, no gravy"));
    fireEvent.press(screen.getByText("Add to order note"));
    expect(register().chat?.note).toBe("2 chicken joy po, no gravy");
    expect(screen.getByText("Added to the order note.")).toBeTruthy();
    expect(screen.getByText("Note: 2 chicken joy po, no gravy")).toBeTruthy();
  });

  it("keeps a tapped address and says a fee needs the Delivery type", () => {
    openChat();
    fireEvent.press(screen.getByLabelText("Use this message: Blk 4 Lot 12 Sampaguita St"));
    fireEvent.press(screen.getByText("Use as delivery address"));
    expect(register().delivery.address).toBe("Blk 4 Lot 12 Sampaguita St");
    expect(screen.getByText("Address saved. Switch the order type to Delivery to charge a fee.")).toBeTruthy();
  });

  it("never offers what the bot or staff said", () => {
    openChat();
    expect(screen.queryByLabelText(/Use this message: Ano pong number/)).toBeNull();
    expect(screen.queryByLabelText(/Use this message: Sent the menu/)).toBeNull();
  });

  it("does not overwrite the name of a saved customer attached to the sale", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    register().setCustomerName("Maria Santos");
    usePosCartStore.setState({ attachedCustomer: { id: "c1", name: "Maria Santos" } as never });
    render(<ChatOrderBanner />);
    fireEvent.press(screen.getByText("View chat"));
    fireEvent.press(screen.getByText("Name · Ana Cruz"));
    expect(register().customerName).toBe("Maria Santos");
    expect(screen.getByText("A saved customer is attached, so their name is used.")).toBeTruthy();
  });
});

describe("ChatOrderBanner — Found in chat", () => {
  const dishes = [{ id: "joy", name: "Chicken Joy" }, { id: "spag", name: "Jolly Spaghetti" }];

  // The register's own add: the dish lands on the sale.
  const addToSale = jest.fn((dishId: string, quantity: number) =>
    register().add({ menuItemId: dishId, name: dishId, basePrice: 100, quantity, selections: [] }),
  );

  it("offers the dishes the customer typed, one tap each, with their quantity", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner dishes={dishes} onPickDish={addToSale} />);

    expect(mockUseChatThread).toHaveBeenCalledWith(SESSION);
    fireEvent.press(screen.getByLabelText("Add 2 Chicken Joy"));
    expect(addToSale).toHaveBeenCalledWith("joy", 2);
    expect(screen.getByText("✓ 2 × Chicken Joy")).toBeTruthy();
    expect(screen.queryByText(/Jolly Spaghetti/)).toBeNull();
  });

  // Review 2026-11-15: the tick outlived the sale and showed on the next customer's chips.
  it("forgets what was ticked once the dish leaves the sale or the next chat starts", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner dishes={dishes} onPickDish={addToSale} />);
    fireEvent.press(screen.getByLabelText("Add 2 Chicken Joy"));
    expect(screen.getByText("✓ 2 × Chicken Joy")).toBeTruthy();

    act(() => register().remove(register().lines[0].key));
    expect(screen.getByText("+ 2 × Chicken Joy")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Add 2 Chicken Joy"));
    act(() => {
      register().reset();
      register().setChat({ sessionId: "1a2b3c4d-0000-4000-8000-000000000002", name: "Ben" });
      register().add({ menuItemId: "joy", name: "joy", basePrice: 100, quantity: 1, selections: [] });
    });
    expect(screen.getByText("+ 2 × Chicken Joy")).toBeTruthy();
  });

  it("is not shown on the payment screen", () => {
    register().setChat({ sessionId: SESSION, name: "Ana C." });
    render(<ChatOrderBanner variant="tender" dishes={dishes} onPickDish={jest.fn()} />);
    expect(screen.queryByText("Found in chat")).toBeNull();
  });
});
