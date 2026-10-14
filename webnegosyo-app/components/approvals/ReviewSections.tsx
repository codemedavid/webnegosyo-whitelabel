import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { amountSubline, requesterSubline, reviewItemLines, stockLine, type ReviewSignal } from "../../lib/approvals/review-model";
import { formatPesoShort, reasonLabel } from "../../lib/approvals/state";
import type { ApprovalRequestView } from "../../lib/approvals/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { StaffAvatar } from "../staff/StaffAvatar";

/** Amount first (design-spec §3.7.2): the figure, what was paid and whose drawer, the pieces, the stock. */
export function ReviewAmountCard({ request, approveAmount }: { request: ApprovalRequestView; approveAmount: number }) {
  const subline = amountSubline(request);
  const items = reviewItemLines(request);
  const stock = stockLine(request);
  const isLess = approveAmount < request.amount;
  return (
    <View style={styles.card}>
      <Text style={styles.amount} accessibilityRole="header">
        {formatPesoShort(approveAmount)}
      </Text>
      {isLess ? <Text style={styles.meta}>{`Approving less than the ${formatPesoShort(request.amount)} asked`}</Text> : null}
      {subline ? <Text style={styles.meta}>{subline}</Text> : null}
      {items.length > 0 ? (
        <View style={styles.items}>
          {items.map((item, index) => (
            <View key={`${item.label}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={styles.itemAmount}>{item.amount}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {stock ? <Text style={styles.meta}>{stock}</Text> : null}
    </View>
  );
}

/** Who asked and why, in their own words (§3.7.3). */
export function ReviewWhoWhy({ request, now }: { request: ApprovalRequestView; now: Date }) {
  const name = request.requestedByName ?? "Staff";
  return (
    <View style={styles.card}>
      <View style={styles.who}>
        <StaffAvatar name={name} seed={request.requestedBy} size="md" />
        <View style={styles.whoCopy}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{requesterSubline(request, now)}</Text>
        </View>
      </View>
      <View style={styles.reasonChip}>
        <Text style={styles.reasonText}>{reasonLabel(request.kind, request.reasonCode)}</Text>
      </View>
      {request.note ? <Text style={styles.quote}>{`“${request.note}”`}</Text> : null}
    </View>
  );
}

/** "Worth knowing": shape and word, never colour alone (§3.7.4, P7). */
export function SignalList({ signals }: { signals: readonly ReviewSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.signalsTitle}>Worth knowing</Text>
      {signals.map((signal) => (
        <View key={signal.text} style={styles.signal} accessible accessibilityLabel={`${signal.tone === "ok" ? "Good" : "Check"}: ${signal.text}`}>
          <View style={signal.tone === "ok" ? styles.dotOk : styles.diamondCheck} />
          <Text style={styles.signalText}>{signal.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  amount: { fontSize: 32, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  meta: { ...typography.caption, color: colors.textMuted },
  items: { gap: spacing.xs, paddingVertical: spacing.xs },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  itemLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  itemAmount: { ...typography.body, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  who: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  whoCopy: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  reasonChip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  reasonText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  quote: { ...typography.body, fontStyle: "italic", color: colors.textPrimary },
  signalsTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  signal: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 28 },
  dotOk: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  diamondCheck: { width: 9, height: 9, backgroundColor: colors.warning, transform: [{ rotate: "45deg" }] },
  signalText: { ...typography.body, color: colors.textPrimary, flex: 1 },
});
