import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ChatFillSheet } from "./ChatFillSheet";
import type { ChatFillTarget, PosChatOrder } from "../../lib/messenger-chat/chat-order";
import { useChatThread } from "../../lib/messenger-chat/use-chats";
import { foundInChat } from "../../lib/messenger-chat/found-in-chat";
import type { DishName } from "../../lib/messenger-chat/typed-order";
import { useTickerNow } from "../TickerProvider";
import { usePosCartStore } from "../../stores/pos-cart-store";

interface ChatOrderBannerProps {
  /** The payment screen explains what sending does; the register only names the customer. */
  variant?: "register" | "tender";
  style?: ViewStyle;
  /**
   * The register's dishes. With `onPickDish`, the banner offers "Found in
   * chat": the dishes the customer typed, one tap each (T2).
   */
  dishes?: readonly DishName[];
  /** Add a dish the customer typed (the register opens its choices when it has any). */
  onPickDish?: (dishId: string, quantity: number) => void;
}

const FILLED: Record<ChatFillTarget, string> = {
  name: "Name filled in.",
  phone: "Phone number filled in.",
  address: "Delivery address filled in.",
  note: "Added to the order note.",
};

/**
 * Put a tapped chat line on the register's sale (name, phone, address, note).
 * Returns what happened, for the sheet's toast. Shared by the banner and the
 * chat pane beside the register.
 */
export function fillRegisterFromChat(target: ChatFillTarget, value: string): string {
  const register = usePosCartStore.getState();
  if (target === "name") {
    if (register.attachedCustomer) return "A saved customer is attached, so their name is used.";
    register.setCustomerName(value);
  } else if (target === "phone") {
    register.setCustomerPhone(value);
    // A delivery order's phone also rides with the address, for the rider.
    if (register.orderTypeKind === "delivery") register.setDelivery({ phone: value });
  } else if (target === "address") {
    register.setDelivery({ address: value });
    if (register.orderTypeKind !== "delivery") return "Address saved. Switch the order type to Delivery to charge a fee.";
  } else {
    register.addChatNote(value);
  }
  return FILLED[target];
}

/**
 * "Ordering for Ana C." — shown on the register and the payment screen while
 * a sale is being rung up for a Messenger chat. Opens the chat so a name, a
 * phone number, an address or a note can be tapped onto the order.
 *
 * Draws nothing for an ordinary sale.
 */
export function ChatOrderBanner(props: ChatOrderBannerProps) {
  const chat = usePosCartStore((s) => s.chat);
  const isEditing = usePosCartStore((s) => s.editContext !== null);
  if (!chat || isEditing) return null;
  // Keyed by the chat: what was ticked for one customer never shows on the next.
  return <ChatOrderBannerBody key={chat.sessionId} {...props} chat={chat} />;
}

function ChatOrderBannerBody({
  variant = "register",
  style,
  dishes,
  onPickDish,
  chat,
}: ChatOrderBannerProps & { chat: PosChatOrder }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // A tick means "it is on the sale": a line removed from the cart loses it.
  const dishesOnSale = usePosCartStore((s) => s.lines.map((line) => line.menuItemId).join(","));
  const nowMs = useTickerNow();
  const wantsFound = variant === "register" && !!dishes && !!onPickDish;
  // The chat: for "Found in chat" on the register, and the name Meta gave us
  // (offered as one tap) while the sheet is open.
  const { thread } = useChatThread(isChatOpen || wantsFound ? chat.sessionId : null);
  const found = useMemo(
    () => (wantsFound && thread && dishes ? foundInChat(thread.messages, dishes, nowMs) : []),
    // The minute hand only matters for "recent"; re-match when the chat or the menu changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wantsFound, thread, dishes],
  );
  const onSale = useMemo(() => new Set(dishesOnSale.split(",")), [dishesOnSale]);

  const handleFill = fillRegisterFromChat;

  const fullName = [thread?.session.firstName, thread?.session.lastName].filter(Boolean).join(" ");

  const cancel = () => usePosCartStore.getState().setChat(null);

  return (
    <View style={[styles.banner, style]} accessibilityLabel={`Ordering for ${chat.name}, from Messenger`}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            Ordering for {chat.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={variant === "tender" ? 3 : 1}>
            {variant === "tender"
              ? "They get this order in Messenger to confirm. It reaches the kitchen after they confirm, or you confirm it from Orders. Payment is collected later."
              : "From Messenger · sent to them to confirm"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.action}
          onPress={() => setIsChatOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`View the chat with ${chat.name}`}
          hitSlop={8}
        >
          <Text style={styles.actionText}>View chat</Text>
        </TouchableOpacity>
      </View>
      {found.length > 0 ? (
        <View style={styles.found}>
          <Text style={styles.foundTitle}>Found in chat</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.foundChips}>
            {found.map((dish) => {
              const isPicked = picked.has(dish.id) && onSale.has(dish.id);
              return (
                <TouchableOpacity
                  key={dish.id}
                  style={[styles.foundChip, isPicked && styles.foundChipPicked]}
                  onPress={() => {
                    onPickDish?.(dish.id, dish.qty);
                    setPicked((current) => new Set(current).add(dish.id));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${dish.qty} ${dish.name}`}
                >
                  <Text style={[styles.foundChipText, isPicked && styles.foundChipTextPicked]} numberOfLines={1}>
                    {isPicked ? "✓ " : "+ "}{dish.qty} × {dish.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {chat.note ? (
        <Text style={styles.note} numberOfLines={3}>
          Note: {chat.note}
        </Text>
      ) : null}
      <TouchableOpacity onPress={cancel} accessibilityRole="button" accessibilityLabel="Make this an ordinary sale" hitSlop={8}>
        <Text style={styles.cancel}>Not for this chat</Text>
      </TouchableOpacity>

      <ChatFillSheet
        visible={isChatOpen}
        sessionId={chat.sessionId}
        name={chat.name}
        facebookName={fullName || null}
        onClose={() => setIsChatOpen(false)}
        onFill={handleFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textPrimary },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  actionText: { ...typography.caption, fontWeight: "700", color: colors.textOnDark },
  note: { ...typography.caption, color: colors.textPrimary },
  cancel: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
  found: { gap: spacing.xs },
  foundTitle: { ...typography.eyebrow, color: colors.statusPreparing.text },
  foundChips: { gap: spacing.sm },
  foundChip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  foundChipPicked: { backgroundColor: colors.accent },
  foundChipText: { ...typography.caption, fontWeight: "700", color: colors.statusPreparing.text },
  foundChipTextPicked: { color: colors.textOnDark },
});
