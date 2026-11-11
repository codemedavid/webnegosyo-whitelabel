/**
 * Tells the cashier what the register is doing about the connection.
 *
 * Renders only when there is something to say: the shop is offline (sales
 * are being kept on this device), sales taken offline are still waiting to
 * reach the server, or a sale the server refused needs a person. Silent the
 * rest of the time, so a working register looks exactly as it did before.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/colors";
import { useConnectivity } from "../../lib/offline/use-connectivity";
import { usePendingSaleCounts, type PendingSaleCounts } from "../../lib/offline/use-outbox-sync";
import { offlineBannerText } from "../../lib/offline/banner-text";
import { useDeviceExpenseQueue } from "../../lib/expenses/use-expenses";

type Tone = "offline" | "syncing" | "attention";

function toneFor(status: string, counts: PendingSaleCounts): Tone {
  if (status === "offline") return "offline";
  return counts.stuck > 0 && counts.pending === 0 ? "attention" : "syncing";
}

export function OfflineBanner() {
  // The register clears the notch above this banner (it used to clear it
  // here AND in the header below, doubling the gap while offline).
  const { status } = useConnectivity();
  const counts = usePendingSaleCounts();
  // Expenses saved on this phone and not yet sent (refused ones are on Expenses' "Check these").
  const expenseQueue = useDeviceExpenseQueue();
  const expensesWaiting = expenseQueue.expenses.filter((entry) => entry.refusedReason === null).length;
  const text = offlineBannerText(status, counts, expensesWaiting);
  if (text === null) return null;

  return (
    <View
      style={[styles.bar, styles[toneFor(status, counts)]]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.label} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  offline: { backgroundColor: colors.warningLight },
  syncing: { backgroundColor: colors.statusReady.bg },
  attention: { backgroundColor: colors.statusPreparing.bg },
  label: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
});
