import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { ListRow } from "../ListRow";
import { FloorSheet } from "../tables/FloorSheet";
import { displayCustomerName } from "../../lib/order-visuals";
import { billOrderRef } from "../../lib/bill/bill-orders";
import type { BillCandidate } from "../../lib/bill/bill-candidates";

interface AddOrderSheetProps {
  visible: boolean;
  candidates: readonly BillCandidate[];
  onPick: (orderId: string) => void;
  onClose: () => void;
}

/** Pick an order to put on this bill. Only orders that still owe money are offered. */
export function AddOrderSheet({ visible, candidates, onPick, onClose }: AddOrderSheetProps) {
  return (
    <FloorSheet visible={visible} title="Combine an order" subtitle="Orders that still owe money" onClose={onClose}>
      {candidates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No other unpaid orders right now.</Text>
        </View>
      ) : (
        candidates.map((order, index) => (
          <ListRow
            key={order._id}
            title={`${billOrderRef(order)} · ${displayCustomerName(order.customerName)}`}
            subtitle={[order.table ? `Table ${order.table}` : null, order.status].filter(Boolean).join(" · ")}
            icon="plus"
            tone="accent"
            trailing={<Text style={styles.total}>{formatPeso(order.total)}</Text>}
            onPress={() => onPick(order._id)}
            grouped={index < candidates.length - 1}
          />
        ))
      )}
    </FloorSheet>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.xxl, alignItems: "center" },
  emptyText: { ...typography.body, color: colors.textSecondary },
  total: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
