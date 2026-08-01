import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Card } from "../Card";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  toPaymentLines,
  toRevisionLines,
  summarizeSettlement,
  type OrderPaymentLike,
  type OrderRevisionLike,
} from "../../lib/order-history-view";

/**
 * The settlement and edit-history cards on the order detail screen.
 *
 * Deliberately thin: every judgement — which way the money went, what is still
 * owed, how an edit is described — comes from `order-history-view.ts`, which is
 * unit tested. Jest is scoped to `lib/` and `theme/` in this app, so anything
 * decided in here would be decided untested.
 */

interface SettlementCardProps {
  total: number;
  payments: readonly OrderPaymentLike[];
  /** Hidden entirely when the backend cannot serve a ledger. */
  isLedgerAvailable: boolean;
}

const INTENT_COPY: Record<string, { label: string; tone: string; bg: string }> = {
  collect: { label: "Still owing", tone: colors.danger, bg: colors.dangerLight },
  refund: { label: "Refund due", tone: colors.warning, bg: colors.warningLight },
  settled: { label: "Settled", tone: colors.success, bg: colors.successLight },
};

export function SettlementCard({
  total,
  payments,
  isLedgerAvailable,
}: SettlementCardProps) {
  if (!isLedgerAvailable) return null;

  const summary = summarizeSettlement(total, payments);
  const lines = toPaymentLines(payments);
  const intent = INTENT_COPY[summary.intent] ?? INTENT_COPY.settled;

  return (
    <Card title="Payments" style={styles.card}>
      <View style={[styles.balanceRow, { backgroundColor: intent.bg }]}>
        <Text style={[styles.balanceLabel, { color: intent.tone }]}>{intent.label}</Text>
        <Text style={[styles.balanceAmount, { color: intent.tone }]}>
          {summary.balanceLabel}
        </Text>
      </View>

      {lines.length === 0 ? (
        <Text style={styles.empty}>Nothing has been collected for this order yet.</Text>
      ) : (
        lines.map((line) => (
          <View key={line._id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{line.methodLabel}</Text>
              {line.reference ? (
                <Text style={styles.rowSub}>Ref {line.reference}</Text>
              ) : null}
              {line.note ? <Text style={styles.rowSub}>{line.note}</Text> : null}
              {line.proofUrl ? (
                <TouchableOpacity onPress={() => Linking.openURL(line.proofUrl!)}>
                  <Text style={styles.link}>View proof</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text
              style={[
                styles.rowAmount,
                { color: line.direction === "out" ? colors.danger : colors.success },
              ]}
            >
              {line.amountLabel}
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

interface RevisionCardProps {
  revisions: readonly OrderRevisionLike[];
}

/** Absent entirely on an order never edited — an empty card is just noise. */
export function RevisionHistoryCard({ revisions }: RevisionCardProps) {
  const lines = toRevisionLines(revisions);
  if (lines.length === 0) return null;

  return (
    <Card title="Edit history" style={styles.card}>
      {lines.map((line) => (
        <View key={line._id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{line.title}</Text>
            <Text style={styles.rowSub}>{line.totalsLabel}</Text>
            {line.reason ? <Text style={styles.rowSub}>{line.reason}</Text> : null}
          </View>
          <Text
            style={[
              styles.rowAmount,
              {
                color:
                  line.direction === "down"
                    ? colors.danger
                    : line.direction === "up"
                      ? colors.success
                      : colors.textSecondary,
              },
            ]}
          >
            {line.deltaLabel}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  balanceLabel: { ...typography.small, fontWeight: "700", textTransform: "uppercase" },
  balanceAmount: { ...typography.body, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, paddingRight: spacing.md },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  rowSub: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  rowAmount: { ...typography.body, fontWeight: "700" },
  link: { ...typography.small, color: colors.primary, marginTop: 2 },
  empty: { ...typography.small, color: colors.textSecondary },
});
