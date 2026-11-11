import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { refusedPayoutsHeadline, refusedPayoutsNote } from "../../lib/expenses/drawer-expenses";
import type { RefusedPayout } from "../../lib/expenses/expense-queue";
import { formatPeso } from "../../lib/expenses/keypad";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";

interface RefusedPayoutsProps {
  payouts: readonly RefusedPayout[];
  onRetry: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** The close sheet explains why the count reads short; the shift card keeps it brief. */
  isExplained?: boolean;
}

/**
 * Pay-outs from my drawer that the store did not take ("1 pay-out didn't
 * save · ₱120"), each with its reason and the two things a cashier can do
 * right here: Try again, or Remove it from the phone. Shown on the shift
 * card and on the close sheet, so a refused pay-out never hides behind a
 * "waiting to sync" line or a short count. Renders nothing when there is none.
 */
export function RefusedPayouts({ payouts, onRetry, onRemove, isExplained = false }: RefusedPayoutsProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const headline = refusedPayoutsHeadline(payouts);
  if (!headline) return null;

  const run = async (id: string, work: (id: string) => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await work(id);
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (payout: RefusedPayout) => {
    Alert.alert(
      "Remove this pay-out?",
      `${payout.categoryName} ${formatPeso(payout.cents)} will be taken off this phone. If the cash did leave the drawer, let the owner know.`,
      [
        { text: "Keep it", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void run(payout.id, onRemove) },
      ],
    );
  };

  return (
    <View style={styles.box} accessibilityLiveRegion="polite" testID="refused-payouts">
      <Text style={styles.headline}>{headline}</Text>
      {isExplained ? <Text style={styles.note}>{refusedPayoutsNote(payouts)}</Text> : null}
      {payouts.map((payout) => (
        <View key={payout.id} style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {payout.categoryName} · {formatPeso(payout.cents)}
            </Text>
            <Text style={styles.reason} numberOfLines={3}>
              {payout.reason}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              label="Try again"
              size="sm"
              tone="secondary"
              fullWidth={false}
              isLoading={busyId === payout.id}
              disabled={busyId !== null}
              onPress={() => void run(payout.id, onRetry)}
              accessibilityLabel={`Try again: ${payout.categoryName} ${formatPeso(payout.cents)}`}
            />
            <Button
              label="Remove"
              size="sm"
              tone="ghost"
              fullWidth={false}
              disabled={busyId !== null}
              onPress={() => confirmRemove(payout)}
              accessibilityLabel={`Remove: ${payout.categoryName} ${formatPeso(payout.cents)}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  headline: { ...typography.body, fontWeight: "800", color: colors.statusPending.text },
  note: { ...typography.caption, color: colors.textPrimary },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  copy: { flex: 1, minWidth: 160, gap: 2 },
  title: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  reason: { ...typography.small, color: colors.textSecondary },
  actions: { flexDirection: "row", gap: spacing.xs, marginLeft: "auto" },
});
