import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import {
  formatIncomingHandle,
  describeIncomingOrder,
  type IncomingOrder,
} from "../../lib/pos-incoming";

interface IncomingOrdersSheetProps {
  orders: IncomingOrder[];
  unseenCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (orderId: string) => void;
}

/** Rows visible before the list scrolls, so the grid keeps most of the screen. */
const LIST_MAX_HEIGHT = 220;

/**
 * Orders arriving from the web, docked above the running sale.
 *
 * Collapsed to a single handle by default: the cashier is mid-transaction and
 * the product grid is what they need. The handle carries the whole signal —
 * an unseen count in the accent colour when something new has landed, a plain
 * count otherwise — so a glance is enough and expanding is optional.
 *
 * Renders nothing at all when the queue is empty. A permanent "no orders" strip
 * would cost grid space every hour of every quiet shift.
 */
export function IncomingOrdersSheet({
  orders,
  unseenCount,
  isExpanded,
  onToggle,
  onSelect,
}: IncomingOrdersSheetProps) {
  if (orders.length === 0) return null;

  const hasUnseen = unseenCount > 0;
  const label = formatIncomingHandle(unseenCount, orders.length);

  return (
    <View style={styles.sheet}>
      <TouchableOpacity
        style={styles.handle}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          isExpanded ? `Hide incoming orders, ${label}` : `Show incoming orders, ${label}`
        }
      >
        <View style={styles.handleLeft}>
          <View style={[styles.dot, hasUnseen && styles.dotAlert]} />
          <Text style={[styles.handleText, hasUnseen && styles.handleTextAlert]}>{label}</Text>
        </View>
        <Text style={styles.chevron}>{isExpanded ? "⌄" : "⌃"}</Text>
      </TouchableOpacity>

      {isExpanded ? (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {orders.map((order) => (
            <TouchableOpacity
              key={order._id}
              style={styles.row}
              onPress={() => onSelect(order._id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Open order, ${describeIncomingOrder(order)}`}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {describeIncomingOrder(order)}
                </Text>
                {order.status ? <Text style={styles.rowMeta}>{order.status}</Text> : null}
              </View>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    ...shadow.md,
  },
  handle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  handleLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.textTertiary,
  },
  dotAlert: { backgroundColor: colors.accent },
  handleText: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  handleTextAlert: { color: colors.accent },
  chevron: { fontSize: 14, color: colors.textTertiary, width: 12, textAlign: "right" },
  list: { maxHeight: LIST_MAX_HEIGHT },
  listContent: { gap: spacing.xs, paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  rowMeta: { ...typography.small, color: colors.textSecondary, textTransform: "capitalize" },
  rowChevron: { fontSize: 20, color: colors.textTertiary },
});
