import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { billOrderRef, orderOwed, type BillOrder } from "../../lib/bill/bill-orders";
import { displayCustomerName } from "../../lib/order-visuals";

interface BillOrdersCardProps {
  orders: readonly BillOrder[];
  /** A guest has paid through the split: the orders can no longer change. */
  isLocked: boolean;
  onAdd: () => void;
  onRemove: (orderId: string) => void;
  onOpen: (orderId: string) => void;
}

/** The orders this bill covers. Combining is "Add another order"; nothing else to learn. */
export function BillOrdersCard({ orders, isLocked, onAdd, onRemove, onOpen }: BillOrdersCardProps) {
  return (
    <View style={styles.card}>
      {orders.map((order) => {
        const owed = orderOwed(order);
        return (
          <View key={order._id} style={styles.row}>
            <TouchableOpacity
              style={styles.main}
              onPress={() => onOpen(order._id)}
              accessibilityRole="button"
              accessibilityLabel={`Open order ${billOrderRef(order)}`}
            >
              <Text style={styles.ref}>{billOrderRef(order)}</Text>
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayCustomerName(order.customerName)}
                </Text>
                <Text style={[styles.meta, owed <= 0 && styles.paid]}>
                  {owed <= 0 ? "Paid" : order.amountPaid > 0 ? `${formatPeso(owed)} left` : "Unpaid"}
                </Text>
              </View>
              <Text style={styles.total}>{formatPeso(order.total)}</Text>
            </TouchableOpacity>
            {orders.length > 1 && !isLocked ? (
              <IconButton icon="close" label={`Take order ${billOrderRef(order)} off this bill`} onPress={() => onRemove(order._id)} />
            ) : null}
          </View>
        );
      })}
      {isLocked ? (
        <Text style={styles.lockedHint}>A guest has paid, so these orders stay together.</Text>
      ) : (
        <TouchableOpacity style={styles.add} onPress={onAdd} accessibilityRole="button">
          <Icon name="plus" size={18} color={colors.accent} />
          <Text style={styles.addText}>Combine another order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  ref: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  paid: { color: colors.success },
  total: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  add: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  addText: { ...typography.body, fontWeight: "700", color: colors.accent },
  lockedHint: { ...typography.caption, color: colors.textSecondary, paddingVertical: spacing.md },
});
