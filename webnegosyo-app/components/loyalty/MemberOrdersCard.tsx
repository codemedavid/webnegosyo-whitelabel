import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import type { LoyaltyLedgerEntry, LoyaltyMemberOrder } from "../../lib/loyalty/members";

const KIND_LABELS: Record<string, string> = {
  earn: "Earned",
  reverse: "Returned",
  redeem: "Redeemed",
  correction: "Adjusted",
};

function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function peso(amount: number): string {
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What they ordered, and every move their card has made.
 *
 * Two tabs rather than two cards: they answer the same question — "what has
 * this customer actually done here?" — from two sides, and a merchant checking
 * a disputed stamp wants to flip between them, not scroll past one to reach
 * the other.
 *
 * Orders are merged from whichever backend the store rings sales on, so a shop
 * that moved from Convex to the platform still sees one unbroken history.
 */
export function MemberOrdersCard({
  orders,
  history,
}: {
  orders: LoyaltyMemberOrder[];
  history: LoyaltyLedgerEntry[];
}) {
  const [tab, setTab] = useState<"orders" | "history">("orders");

  return (
    <View style={styles.card}>
      <View style={styles.tabs}>
        {(
          [
            { value: "orders" as const, label: `Orders (${orders.length})` },
            { value: "history" as const, label: `Card history (${history.length})` },
          ]
        ).map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.tab, tab === option.value && styles.tabActive]}
            onPress={() => setTab(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === option.value }}
          >
            <Text style={[styles.tabLabel, tab === option.value && styles.tabLabelActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "orders" ? (
        orders.length === 0 ? (
          <Text style={styles.muted}>
            No orders on file for this customer yet. An order only lands here once it has been
            captured against their number.
          </Text>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{peso(order.total)}</Text>
                <Text style={styles.rowMeta}>{formatDateTime(order.orderedAt)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {[order.channel, order.status, order.paymentStatus]
                  .filter(Boolean)
                  .join(" · ") || "No status recorded"}
                {order.reference ? ` · #${order.reference}` : ""}
              </Text>
              {order.items.length > 0 ? (
                <Text style={styles.items} numberOfLines={2}>
                  {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                </Text>
              ) : null}
              {order.address ? <Text style={styles.address}>{order.address}</Text> : null}
            </View>
          ))
        )
      ) : history.length === 0 ? (
        <Text style={styles.muted}>Nothing has moved on this card yet.</Text>
      ) : (
        history.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>
                {KIND_LABELS[entry.kind] ?? entry.kind}{" "}
                <Text style={entry.delta < 0 ? styles.deltaDown : styles.deltaUp}>
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </Text>
              </Text>
              <Text style={styles.rowMeta}>{formatDateTime(entry.createdAt)}</Text>
            </View>
            <Text style={styles.rowMeta}>
              {entry.programName}
              {entry.orderRef ? ` · order #${entry.orderRef}` : ""}
              {/* A shadow row was recorded but never touched the balance. Saying
                  so stops it reading as a stamp the customer can spend. */}
              {entry.isShadow ? " · test only, not counted" : ""}
            </Text>
            {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tabs: { flexDirection: "row", gap: spacing.xs },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  tabLabelActive: { color: colors.textOnDark, fontWeight: "700" },
  muted: { ...typography.caption, color: colors.textSecondary },
  row: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowMeta: { ...typography.small, color: colors.textSecondary },
  items: { ...typography.caption, color: colors.textPrimary },
  address: { ...typography.small, color: colors.textSecondary, fontStyle: "italic" },
  note: { ...typography.caption, color: colors.textPrimary, fontStyle: "italic" },
  deltaUp: { color: colors.success, fontWeight: "800" },
  deltaDown: { color: colors.danger, fontWeight: "800" },
});
