/**
 * An order rung up for a Messenger chat, driven through the REAL register store.
 *
 * "Make order" on a chat puts that chat on the sale. What this pins: the placed
 * order names the chat by its id and never carries a Messenger id from the
 * phone, lines tapped from the chat become the order's note, and the chat
 * leaves with the sale — the next customer's order must never be sent to the
 * last customer's Messenger.
 */

import { enterEditMode } from "../lib/pos-edit-mode";
import { chatOrderCustomerData } from "../lib/messenger-chat/chat-order";
import { buildCreateOrderRows } from "../lib/backends/supabase-orders";
import { buildPosOrder } from "../lib/pos-order";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";

const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 1,
  selections: [],
};

const store = () => usePosCartStore.getState();

beforeEach(() => {
  store().reset();
  useAuthStore.setState({ outletId: null });
});

/** The order the payment screen builds for a chat sale. */
function placedOrder() {
  return buildPosOrder({
    cart: store().lines,
    serviceCharge: store().serviceCharge,
    delivery: store().delivery,
    table: store().table,
    customerName: store().customerName,
    // Collected after the customer confirms: no tender, like any pay-later sale.
    tender: null,
    clientOrderId: "sale-chat-1",
    customerData: chatOrderCustomerData(store().chat),
  });
}

describe("journey — an order rung up from a customer's chat", () => {
  beforeEach(() => {
    store().setChat({ sessionId: SESSION, name: "Ana C." });
    store().setCustomerName("Ana Cruz");
    store().add(LATTE);
  });

  it("holds the chat on the sale, with an empty note", () => {
    expect(store().chat).toEqual({ sessionId: SESSION, name: "Ana C.", note: "" });
  });

  it("places an order that names the chat and nothing else about Messenger", () => {
    const order = placedOrder();
    expect(order.customerName).toBe("Ana Cruz");
    expect(order.customerData.messenger_session_id).toBe(SESSION);
    expect(order.customerData.messenger_psid).toBeUndefined();
    expect(order.customerData.messenger_sender_id).toBeUndefined();
  });

  it("carries the lines tapped from the chat as the order's note, once each", () => {
    store().addChatNote("No onions po");
    store().addChatNote("No onions po");
    store().addChatNote("Extra sauce");
    expect(store().chat?.note).toBe("No onions po\nExtra sauce");
    expect(placedOrder().customerData.note_from_chat).toBe("No onions po\nExtra sauce");
  });

  it("is saved waiting when the register holds it for the customer", () => {
    const args = { ...placedOrder(), source: "pos" as const, holdForCustomer: true };
    const { order } = buildCreateOrderRows("tenant-1", args);
    expect(order.status).toBe("pending");
    expect(order.source).toBe("pos");
    expect((order.customer_data as Record<string, unknown>).messenger_session_id).toBe(SESSION);
  });

  it("leaves with the sale, so the next order is an ordinary one", () => {
    store().reset();
    expect(store().chat).toBeNull();
    store().add(LATTE);
    expect(placedOrder().customerData.messenger_session_id).toBeUndefined();
  });

  it("can be taken off the sale without clearing the cart", () => {
    store().setChat(null);
    expect(store().chat).toBeNull();
    expect(store().lines).toHaveLength(1);
    expect(placedOrder().customerData.messenger_session_id).toBeUndefined();
  });

  // Found on a simulator walk: the cashier tapped the phone in from the chat,
  // then picked Pick Up, and the number was gone from the payment screen.
  it("keeps the phone tapped in from the chat when the order type changes", () => {
    store().setCustomerPhone("09171234567");
    store().setOrderType("type-pickup", "Pick Up", undefined, null, "pickup");
    expect(store().customerPhone).toBe("09171234567");
  });

  it("still drops a walk-in's phone on an ordinary sale that leaves dine-in", () => {
    store().setChat(null);
    store().setCustomerPhone("09171234567");
    store().setOrderType("type-pickup", "Pick Up", undefined, null, "pickup");
    expect(store().customerPhone).toBe("");
  });

  it("is dropped when the register turns to editing a placed order", () => {
    const placed = {
      _id: "order-1",
      total: 150,
      revisionNumber: 0,
      items: [
        { _id: "oi-1", orderId: "order-1", menuItemId: "m-latte", menuItemName: "Latte", quantity: 1, price: 150, subtotal: 150, addons: [] },
      ],
    };
    store().beginEdit(enterEditMode(placed, [{ kind: "charge", amount: 150 }], {}));
    expect(store().chat).toBeNull();
  });
});

describe("journey — an ordinary sale", () => {
  it("has no chat, keeps no note and writes no chat key", () => {
    store().add(LATTE);
    store().addChatNote("should go nowhere");
    expect(store().chat).toBeNull();
    const order = placedOrder();
    expect(order.customerData.messenger_session_id).toBeUndefined();
    expect(order.customerData.note_from_chat).toBeUndefined();
  });
});
