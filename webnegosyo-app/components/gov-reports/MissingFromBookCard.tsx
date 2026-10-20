import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MissingOrder } from "../../lib/gov-reports/missing-orders";
import { formatManilaDateTime, formatPesoCentavos } from "../../lib/gov-reports/format";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";

interface MissingFromBookCardProps {
  orders: readonly MissingOrder[];
  /** Resolves to an error message, or null when it was recorded. */
  onRecord: (orderId: string) => Promise<string | null>;
}

const SHOWN = 10;

/**
 * Orders that gave a Senior/PWD discount but never reached the sales book.
 * "Record now" files each one from the order as stored (the server re-prices
 * it); nothing is typed. Hidden when there is nothing missing.
 */
export function MissingFromBookCard({ orders, onRecord }: MissingFromBookCardProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  if (orders.length === 0) return null;

  const record = async (orderId: string) => {
    setPendingId(orderId);
    const message = await onRecord(orderId);
    setPendingId(null);
    setErrors((current) =>
      Object.fromEntries([
        ...Object.entries(current).filter(([id]) => id !== orderId),
        ...(message ? [[orderId, message] as const] : []),
      ]),
    );
  };

  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>Missing from sales book ({orders.length})</Text>
      <Text style={styles.body}>
        These orders gave a Senior/PWD discount, but it was never written to your sales book. Record each one so
        your BIR books are complete.
      </Text>
      {orders.slice(0, SHOWN).map((order) => (
        <View key={order.orderId} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {order.label ?? "Order"} · {formatPesoCentavos(order.reduction)} off
            </Text>
            <Text style={styles.rowMeta}>
              {formatManilaDateTime(order.occurredAt)} · {order.claimantCount}{" "}
              {order.claimantCount === 1 ? "claimant" : "claimants"}
            </Text>
            {errors[order.orderId] ? <Text style={styles.error}>{errors[order.orderId]}</Text> : null}
          </View>
          <Button
            label={pendingId === order.orderId ? "Recording…" : "Record now"}
            onPress={() => void record(order.orderId)}
            disabled={pendingId !== null}
            size="sm"
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  title: { ...typography.heading, color: colors.danger },
  body: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, marginTop: 2 },
});
