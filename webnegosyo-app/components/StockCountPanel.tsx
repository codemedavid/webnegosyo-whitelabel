import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { describeCountPanel } from "../lib/daily-report/count-panel";
import type { CountSessionProgress } from "../lib/daily-report/count-session";
import { colors, typography, spacing, radius } from "../theme/colors";

interface StockCountPanelProps {
  /** How far the running count has got, or `null` when none is running. */
  progress: CountSessionProgress | null;
  isBusy?: boolean;
  onStart: () => void;
  onFinish: () => void;
}

/**
 * Starting and finishing a stock count, at the shelf.
 *
 * Every word comes from lib/daily-report/count-panel.ts, which is a
 * parity-guarded copy of the web's. Hand-writing the copy here would let the
 * phone and the web describe one count differently, and a merchant with two
 * accounts of the same count has no way to choose between them.
 *
 * The confirmation before finishing is the panel's real job beyond its two
 * buttons. A count abandoned at the fourth shelf is indistinguishable, on the
 * report, from a store where nothing was missing — so the last moment the
 * merchant can still change that outcome is the moment worth spending.
 */
export function StockCountPanel({ progress, isBusy, onStart, onFinish }: StockCountPanelProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const copy = describeCountPanel(progress);

  const finish = () => {
    if (!copy.closingWarning) {
      onFinish();
      return;
    }

    // Alert rather than an inline confirm: this interrupts, and interrupting is
    // the point when the alternative is a report that quietly overstates how
    // much of the shelf was accounted for.
    setIsConfirming(true);
    Alert.alert("Finish this count?", copy.closingWarning, [
      { text: "Keep counting", style: "cancel", onPress: () => setIsConfirming(false) },
      {
        text: "Finish anyway",
        style: "destructive",
        onPress: () => {
          setIsConfirming(false);
          onFinish();
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Stock count</Text>
        {copy.progressLabel !== null && <Text style={styles.progress}>{copy.progressLabel}</Text>}
      </View>

      <Text style={styles.detail}>{copy.detail}</Text>

      <TouchableOpacity
        style={[styles.action, copy.isCounting && styles.actionFinish]}
        onPress={copy.isCounting ? finish : onStart}
        disabled={isBusy || isConfirming}
        accessibilityRole="button"
        accessibilityLabel={copy.actionLabel}
      >
        {isBusy ? (
          <ActivityIndicator color={colors.heroInkText} />
        ) : (
          <Text style={styles.actionLabel}>{copy.actionLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  progress: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  detail: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  action: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  actionFinish: { backgroundColor: colors.success },
  actionLabel: { ...typography.body, color: colors.heroInkText, fontWeight: "700" },
});
