import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { PendingReply } from "../../lib/messenger-chat/staff-chat";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface PendingRepliesProps {
  replies: readonly PendingReply[];
  onRetry: (reply: PendingReply) => void;
  onDismiss: (clientId: string) => void;
}

/**
 * Replies typed in the app that the chat log does not show yet, under the
 * newest line: "Sending…", "Sent", or why it failed with Try again / Remove.
 */
export function PendingReplies({ replies, onRetry, onDismiss }: PendingRepliesProps) {
  if (replies.length === 0) return null;
  return (
    <View style={styles.pending}>
      {replies.map((reply) => (
        <View key={reply.clientId} style={styles.row}>
          <View style={[styles.bubble, reply.status === "failed" && styles.failed]}>
            <Text style={styles.text}>{reply.text}</Text>
          </View>
          {reply.status === "failed" ? (
            <View style={styles.actions}>
              <Text style={styles.error}>{reply.error ?? "Not sent."}</Text>
              <TouchableOpacity onPress={() => onRetry(reply)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.retry}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDismiss(reply.clientId)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.dismiss}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.status}>{reply.status === "sending" ? "Sending…" : "Sent"}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { gap: spacing.sm, paddingTop: spacing.sm },
  row: { alignSelf: "flex-end", alignItems: "flex-end", maxWidth: "84%", gap: 2 },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm / 2,
    backgroundColor: colors.primary,
    opacity: 0.75,
  },
  failed: { opacity: 1, backgroundColor: colors.danger },
  text: { ...typography.body, color: colors.textOnDark },
  status: { ...typography.small, color: colors.textMuted, marginHorizontal: spacing.xs },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap", justifyContent: "flex-end" },
  error: { ...typography.small, color: colors.danger },
  retry: { ...typography.small, fontWeight: "700", color: colors.accent },
  dismiss: { ...typography.small, fontWeight: "700", color: colors.textMuted },
});
