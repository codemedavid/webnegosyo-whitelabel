import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { ChatLine } from "./ChatLine";
import { ChatFillSheet } from "./ChatFillSheet";
import { fillRegisterFromChat } from "./ChatOrderBanner";
import { useChatThread } from "../../lib/messenger-chat/use-chats";
import { useIsScreenFocused } from "../../lib/query/use-screen-focus";
import {
  CHAT_SPLIT_LABELS,
  CHAT_SPLIT_SIZES,
  chatPaneHeight,
  chatPaneLineLimit,
  type ChatSplitSize,
} from "../../lib/messenger-chat/chat-split";

interface ChatSplitPaneProps {
  sessionId: string;
  name: string;
  /**
   * `split`: above the register on a phone, with the More chat · Half · More
   * menu handle. `column`: a tablet column left of the grid, full height.
   */
  variant: "split" | "column";
  /** Window height, for the split sizes. */
  windowHeight: number;
  /** Space for the notch (the pane is the top of the screen). */
  topInset: number;
  style?: ViewStyle;
}

/**
 * What the customer wrote, kept on screen while the order is rung up (plan
 * 2026-11-15, canvas 4a / 4c). The register below is the normal register:
 * same cart, same send. A tap on a line opens the tap-to-fill sheet (name,
 * phone, address, note), the same one the banner's "View chat" opens.
 */
export function ChatSplitPane({ sessionId, name, variant, windowHeight, topInset, style }: ChatSplitPaneProps) {
  const [size, setSize] = useState<ChatSplitSize>("half");
  const [isFillOpen, setIsFillOpen] = useState(false);
  // Keeps reading at the chat screen's pace while the register is in view (the
  // POS tab stays mounted behind other tabs; the app's background stops it too).
  const isOnScreen = useIsScreenFocused();
  const { thread, isLoading, error } = useChatThread(sessionId, { isLive: isOnScreen });

  const limit = chatPaneLineLimit(variant === "column" ? "column" : size);
  // Newest first for the inverted list: the latest line sits just above the handle.
  const lines = useMemo(() => (thread?.messages ?? []).slice(-limit).reverse(), [thread, limit]);
  const fullName = [thread?.session.firstName, thread?.session.lastName].filter(Boolean).join(" ");

  const height = variant === "split" ? chatPaneHeight(size, windowHeight) : undefined;

  return (
    <View
      style={[variant === "split" ? styles.split : styles.column, { paddingTop: topInset }, style]}
      accessibilityLabel={`Chat with ${name}`}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>Chat with {name}</Text>
        <TouchableOpacity
          onPress={() => setIsFillOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Copy details from the chat with ${name}`}
          hitSlop={8}
        >
          <Text style={styles.headerAction}>Copy details</Text>
        </TouchableOpacity>
      </View>

      <View style={height !== undefined ? { height } : styles.fill}>
        {lines.length === 0 ? (
          <Text style={styles.empty}>
            {isLoading ? "Loading the chat…" : error ? "The chat could not be loaded." : "No messages in the last 30 days."}
          </Text>
        ) : (
          <FlatList
            data={lines}
            inverted
            keyExtractor={(line) => line.id}
            contentContainerStyle={styles.lines}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={item.direction !== "in"}
                onPress={() => setIsFillOpen(true)}
                accessibilityHint={item.direction === "in" ? "Copy a name, phone or address from this chat onto the order" : undefined}
              >
                <ChatLine message={item} compact={size === "menu" && variant === "split"} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {variant === "split" ? (
        <View style={styles.handle} accessibilityRole="tablist">
          <View style={styles.grip} />
          <View style={styles.segments}>
            {CHAT_SPLIT_SIZES.map((option) => {
              const isOn = option === size;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.segment, isOn && styles.segmentOn]}
                  onPress={() => setSize(option)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isOn }}
                >
                  <Text style={[styles.segmentText, isOn && styles.segmentTextOn]}>{CHAT_SPLIT_LABELS[option]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <ChatFillSheet
        visible={isFillOpen}
        sessionId={sessionId}
        name={name}
        facebookName={fullName || null}
        onClose={() => setIsFillOpen(false)}
        onFill={fillRegisterFromChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  column: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.separator,
  },
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  headerAction: { ...typography.caption, fontWeight: "700", color: colors.accent },
  lines: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  empty: { ...typography.caption, color: colors.textMuted, textAlign: "center", padding: spacing.lg },
  handle: { alignItems: "center", gap: spacing.xs, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.separator },
  segments: {
    flexDirection: "row",
    gap: 2,
    padding: 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
  },
  segment: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, minHeight: 32, justifyContent: "center" },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  segmentTextOn: { color: colors.textOnDark },
});
