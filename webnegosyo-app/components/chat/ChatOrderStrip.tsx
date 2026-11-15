import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { formatDailyOrderNumber } from "../../lib/order-number";
import { getStatusMeta } from "../../lib/order-visuals";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface ChatOrderStripProps {
  order: { id: string; dailyNumber: number | null; status: string };
}

/** "Latest order #07 · Preparing · Open" above a chat: the customer's newest order, one tap away. */
export function ChatOrderStrip({ order }: ChatOrderStripProps) {
  const status = getStatusMeta(order.status);
  return (
    <TouchableOpacity
      style={styles.strip}
      onPress={() => router.push(`/(main)/order/${order.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open their latest order, ${status.label}`}
    >
      <Text style={styles.label}>Latest order</Text>
      <Text style={styles.number}>{formatDailyOrderNumber(order.dailyNumber, order.id)}</Text>
      <View style={[styles.pill, { backgroundColor: status.bg }]}>
        <Text style={[styles.pillText, { color: status.text }]}>{status.label}</Text>
      </View>
      <Text style={styles.open}>Open</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  label: { ...typography.caption, color: colors.textMuted },
  number: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  open: { ...typography.caption, fontWeight: "700", color: colors.accent, marginLeft: "auto" },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  pillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
