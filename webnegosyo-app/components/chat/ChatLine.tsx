import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { formatChatTime, staffLineSender, type ChatMessage } from "../../lib/messenger-chat/chat";

interface ChatLineProps {
  message: ChatMessage;
  /** Tighter bubbles without the time, for the order screen's peek. */
  compact?: boolean;
  /** The signed-in account, so its own app replies read "You · app". */
  viewerId?: string | null;
}

/**
 * One line of a Messenger chat.
 *
 * The customer sits on the left in a white bubble and staff on the right in
 * ink, as in any chat. What the bot sent is a summary, not a message ("Sent
 * the menu"), so it is drawn as one quiet line rather than a bubble a reader
 * would mistake for something a person wrote.
 */
// Memoised: a chat redraws every line on each tick of the clock otherwise.
export const ChatLine = React.memo(function ChatLine({ message, compact = false, viewerId }: ChatLineProps) {
  if (message.direction === "bot") {
    return (
      <View style={styles.botRow} accessibilityLabel={`Bot: ${message.body}`}>
        <Text style={styles.botText} numberOfLines={compact ? 1 : 3}>
          Bot · {message.body}
        </Text>
      </View>
    );
  }

  const isStaff = message.direction === "staff";
  return (
    <View
      style={[styles.row, isStaff ? styles.rowStaff : styles.rowCustomer]}
      accessibilityLabel={`${isStaff ? "Staff" : "Customer"}: ${message.body}`}
    >
      <View style={[styles.bubble, isStaff ? styles.bubbleStaff : styles.bubbleCustomer, compact && styles.bubbleCompact]}>
        <Text style={[styles.body, isStaff && styles.bodyStaff]} numberOfLines={compact ? 2 : undefined}>
          {message.body}
        </Text>
      </View>
      {compact ? null : (
        <Text style={styles.time}>
          {[staffLineSender(message, viewerId), formatChatTime(message.sentAt)].filter(Boolean).join(" · ")}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { maxWidth: "84%", gap: 2 },
  rowCustomer: { alignSelf: "flex-start", alignItems: "flex-start" },
  rowStaff: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleCompact: { paddingVertical: 6 },
  bubbleCustomer: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderBottomLeftRadius: radius.sm / 2,
  },
  bubbleStaff: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2 },
  body: { ...typography.body, color: colors.textPrimary },
  bodyStaff: { color: colors.textOnDark },
  time: { ...typography.small, color: colors.textMuted, marginHorizontal: spacing.xs },
  botRow: { alignSelf: "center", maxWidth: "90%", paddingVertical: 2 },
  botText: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
