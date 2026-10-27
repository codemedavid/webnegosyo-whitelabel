import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { countVerdict, type CountVerdict } from "../../lib/cash/reasons";
import { formatCents, spokenCents } from "../../lib/expenses/expense-format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";

interface VerdictCardProps {
  /** What should be in the drawer. Null = still adding up (never shown as ₱0). */
  expectedCents: number | null;
  countedCents: number;
  /**
   * Blind count, cashier's view: no expected figure and no verdict, only what
   * was counted and who compares it.
   */
  isBlind?: boolean;
  onRecount?: () => void;
}

interface VerdictLook {
  icon: IconName;
  ink: string;
  wash: string;
}

const LOOKS: Record<CountVerdict, VerdictLook> = {
  exact: { icon: "check", ink: colors.success, wash: colors.successLight },
  short: { icon: "warning", ink: colors.danger, wash: colors.dangerLight },
  over: { icon: "info", ink: colors.statusPending.text, wash: colors.warningLight },
};

export const EXACT_LINE = "Exact. Your drawer matches.";
export const RECOUNT_LINE = "Recount once before you remit.";
export const STILL_ADDING_LINE = "Waiting for today's sales to add up…";
export const BLIND_LINE = "Your owner compares this with the sales.";

function headline(verdict: CountVerdict, differenceCents: number): string {
  if (verdict === "exact") return EXACT_LINE;
  return `${verdict === "short" ? "Short" : "Over"} ${formatCents(Math.abs(differenceCents))}`;
}

function Line({ label, value, isStrong, testID }: { label: string; value: string; isStrong?: boolean; testID?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, isStrong && styles.lineStrong]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function signed(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

/**
 * Step 3's result: Exact / Short ₱120 / Over ₱40, always as a word AND an icon
 * AND a tint (never colour alone), then Should be · You counted · Difference in
 * tabular figures. Recount comes first on a Short. Announced once (polite).
 */
export function VerdictCard({ expectedCents, countedCents, isBlind = false, onRecount }: VerdictCardProps) {
  if (isBlind) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surfaceSubtle }]} accessibilityLiveRegion="polite" testID="verdict-card">
        <Line label="You counted" value={formatCents(countedCents)} isStrong testID="verdict-counted" />
        <Text style={styles.note}>{BLIND_LINE}</Text>
      </View>
    );
  }
  if (expectedCents === null) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surfaceSubtle }]} testID="verdict-card">
        <Text style={styles.note}>{STILL_ADDING_LINE}</Text>
        <Line label="You counted" value={formatCents(countedCents)} testID="verdict-counted" />
      </View>
    );
  }

  const difference = countedCents - expectedCents;
  const verdict = countVerdict(difference);
  const look = LOOKS[verdict];
  const title = headline(verdict, difference);
  const spoken = verdict === "exact" ? title : `${verdict === "short" ? "Short" : "Over"} ${spokenCents(Math.abs(difference))}`;
  return (
    <View style={[styles.card, { backgroundColor: look.wash }]} testID={`verdict-card-${verdict}`}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={spoken} accessibilityLiveRegion="polite">
        <Icon name={look.icon} size={26} color={look.ink} strokeWidth={2.25} />
        <Text style={[styles.title, { color: look.ink }]} adjustsFontSizeToFit numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.lines}>
        <Line label="Should be in drawer" value={formatCents(expectedCents)} testID="verdict-expected" />
        <Line label="You counted" value={formatCents(countedCents)} testID="verdict-counted" />
        <View style={[styles.rule, { borderColor: look.ink }]} />
        <Line label="Difference" value={signed(difference)} isStrong testID="verdict-difference" />
      </View>
      {verdict === "short" && onRecount ? (
        <View style={styles.recount}>
          <Text style={styles.recountText}>{RECOUNT_LINE}</Text>
          <Button label="Recount" tone="secondary" size="sm" onPress={onRecount} testID="verdict-recount" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4, flexShrink: 1, fontVariant: ["tabular-nums"] },
  lines: { gap: 6 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.md },
  lineLabel: { ...typography.body, color: colors.textMuted },
  lineValue: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  lineStrong: { fontWeight: "800" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.4 },
  note: { ...typography.caption, color: colors.textMuted },
  recount: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  recountText: { ...typography.caption, flex: 1, color: colors.textPrimary },
});
