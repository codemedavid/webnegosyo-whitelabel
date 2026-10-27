import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { spokenCents } from "../../lib/expenses/expense-format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { BigAmount } from "../BigAmount";
import { useThrottledValue } from "./use-throttled-value";

interface CountTotalPanelProps {
  totalCents: number;
  bills: number;
  coins: number;
  /** "Should be ₱8,465" — or, blind, "We'll compare after you finish." */
  hint?: string | null;
  /** Docked footer on a phone is tighter than the tablet's side panel. */
  isCompact?: boolean;
}

function piecesLine(bills: number, coins: number): string {
  return `${bills} ${bills === 1 ? "bill" : "bills"} · ${coins} ${coins === 1 ? "coin" : "coins"}`;
}

/**
 * The ink running total: "Counted ₱8,345.00 · 47 bills · 65 coins". The figure
 * follows every key; what a screen reader hears is throttled (polite, at most
 * once per 1.5 s) so it isn't read a number per tap.
 */
export function CountTotalPanel({ totalCents, bills, coins, hint, isCompact = false }: CountTotalPanelProps) {
  const announced = useThrottledValue(totalCents);
  return (
    <View style={[styles.panel, isCompact && styles.compact]} testID="count-total">
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Counted</Text>
        <Text style={styles.pieces}>{piecesLine(bills, coins)}</Text>
      </View>
      <BigAmount cents={totalCents} color={colors.heroInkText} size={isCompact ? 30 : 44} testID="count-total-amount" />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <Text
        style={styles.liveRegion}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Counted ${spokenCents(announced)}`}
        testID="count-total-announcement"
      >
        {`Counted ${spokenCents(announced)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  compact: { paddingVertical: spacing.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  pieces: { ...typography.caption, color: colors.heroInkMuted, fontVariant: ["tabular-nums"] },
  hint: { ...typography.caption, color: colors.heroInkText, fontWeight: "600", marginTop: 4 },
  // Kept in the tree for the live region but drawn at zero size: the figure
  // above is the visible one.
  liveRegion: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
