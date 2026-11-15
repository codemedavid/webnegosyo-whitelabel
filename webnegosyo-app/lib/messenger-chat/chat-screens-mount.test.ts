/**
 * Guardrails for the Messenger chat screens.
 *
 * Like the other mount guardrails, this reads the sources instead of rendering
 * them. It pins the wiring no unit test of the pure module sees: both screens
 * are registered and reachable, the door on Orders is only drawn for an account
 * that may read chats, the order screen and the queue ask for the chat, and the
 * reader never asks for a column staff are not granted (which would fail the
 * whole read, not hide the column).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { CHATS_HREF, chatHref } from "../navigation";

const ROOT = join(__dirname, "..", "..");
const read = (...segments: string[]): string => readFileSync(join(ROOT, ...segments), "utf8");

describe("Messenger chat screens", () => {
  it("live at the routes the app pushes", () => {
    expect(CHATS_HREF).toBe("/(main)/chats");
    expect(existsSync(join(ROOT, "app", "(main)", "chats.tsx"))).toBe(true);
    expect(chatHref("abc 1")).toBe("/(main)/chat/abc%201");
    expect(existsSync(join(ROOT, "app", "(main)", "chat", "[sessionId].tsx"))).toBe(true);
  });

  it("are registered as pushed screens, never tabs", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    expect(layout).toMatch(/name="chats" options=\{\{ href: null/);
    expect(layout).toMatch(/name="chat\/\[sessionId\]" options=\{\{ href: null/);
  });

  it("are entered from Orders, only by an account that may read chats", () => {
    const orders = read("app", "(main)", "orders.tsx");
    expect(orders).toMatch(/canReadChats \? \(\s*<IconButton[\s\S]{0,160}router\.push\(CHATS_HREF\)/);
    expect(orders).toContain("useOrderChats(allOrders)");
    expect(orders).toContain("chat={chatBadges.get(order._id)}");
  });

  it("show on the order screen", () => {
    expect(read("app", "(main)", "order", "[orderId].tsx")).toContain("<OrderChatCard order={order}");
  });

  it("gate every read on a platform store and an order-reading key", () => {
    const hooks = read("lib", "messenger-chat", "use-chats.ts");
    expect(hooks).toContain('orderBackend === "platform"');
    expect(hooks).toContain("canReadOrders(");
  });

  it("ring up a chat order only from a store-wide account that may use the register", () => {
    const hooks = read("lib", "messenger-chat", "use-chats.ts");
    expect(hooks).toMatch(/canRead && outletId === null && hasPermission\(\{ role, isOwner, permissions \}, "pos"\)/);
    const chat = read("app", "(main)", "chat", "[sessionId].tsx");
    expect(chat).toMatch(/canMakeOrders \? \(\s*<ChatComposer[\s\S]{0,600}onMakeOrder=\{makeOrder\}/);
    expect(chat).toContain("startChatOrder(");
    expect(read("lib", "messenger-chat", "start-chat-order.ts")).toContain("register.setChat({ sessionId: customer.sessionId, name })");
  });

  it("reply from the app only where the composer is shown, through the web route", () => {
    const chat = read("app", "(main)", "chat", "[sessionId].tsx");
    expect(chat).toContain("const staffTools = useStaffChatTools(sessionId, { isLive: isOnScreen });");
    expect(read("lib", "messenger-chat", "use-chats.ts")).toMatch(/const canReply = useCanMakeChatOrders\(\);[\s\S]{0,200}const isEnabled = canReply/);
    expect(read("lib", "messenger-chat", "staff-chat-service.ts")).toContain("/api/messenger/chat");
  });

  it("hold a chat order for the customer and keep it off the kitchen printer", () => {
    const tender = read("app", "(main)", "pos-tender.tsx");
    // Only on the platform order system, and never while editing a placed order
    // (the rule itself: `tenderShape`, tested in pos-tender-mode.test.ts).
    expect(tender).toMatch(/tenderShape\(\{\s+mode,\s+hasChat: chat !== null,\s+isEditing: editContext !== null,\s+isPlatformBackend: resolveOrderBackend\(/);
    expect(tender).toContain("...(isChatOrder ? { holdForCustomer: true } : {})");
    expect(tender).toContain("...(isChatOrder ? { customerData: chatOrderCustomerData(chat) } : {})");
    expect(tender).toMatch(/if \(printsKitchenChitNow\) \{[\s\S]{0,400}printPosKitchenChit/);
    expect(tender).toContain('<ChatOrderBanner variant="tender"');
    expect(read("app", "(main)", "pos.tsx")).toContain("<ChatOrderBanner");
  });

  it("show where the customer's confirmation stands on the queue and the order", () => {
    const orders = read("app", "(main)", "orders.tsx");
    expect(orders).toContain("useChatOrderRecords(allOrders)");
    expect(orders).toMatch(/if \(knownChatOrderIds\.has\(order\._id\)[^)]*\)[^{]*\{\s+badge\.chatOrder = chatOrderRecords\.get\(order\._id\) \?\? null;/);
    expect(read("components", "chat", "OrderChatCard.tsx")).toContain("useChatOrderRecords(orders)");
    expect(read("lib", "messenger-chat", "client.ts")).toContain('"order_id, state, outcome, summary_sent_at, created_at"');
  });

  it("never ask for the columns staff are not granted", () => {
    const client = read("lib", "messenger-chat", "client.ts");
    expect(client).not.toMatch(/cart_data|checkout_state|cart_version|select\("\*"\)/);
    // The grant in 20261111224021_messenger_chat_log.sql, column for column.
    expect(client).toContain(
      "id, psid, first_name, last_name, profile_pic_url, last_message_at, last_message_preview, last_inbound_at, bot_paused_until",
    );
  });
});
