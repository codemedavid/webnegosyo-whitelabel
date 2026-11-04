import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { DayCloseSnapshot } from "../../lib/cash/day-close";
import { heroOf, periodRowsOf, recountLinesOf, shiftRowsOf, type ViewRow } from "../../lib/cash/day-close-view";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

interface DayCloseSummaryProps {
  snapshot: DayCloseSnapshot;
  /** "Drawer figures only" stores: the sales half is not on the platform. */
  isDrawersOnly: boolean;
}

function Rows({ title, rows }: { title: string; rows: readonly ViewRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {rows.map((row, index) => (
        <View key={row.key} style={[styles.row, index > 0 && styles.divider]}>
          <Text style={styles.rowTitle}>{row.title}</Text>
          <Text style={styles.rowDetail}>{row.detail}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The day in one ink hero ("Cash to deposit" and the lines behind it), then
 * by shift, by named shift (adding up to net sales with "Other hours") and any
 * count that changed on a recount. One money number per screen (06 §1).
 */
export function DayCloseSummary({ snapshot, isDrawersOnly }: DayCloseSummaryProps) {
  const hero = heroOf(snapshot);
  const recounts = recountLinesOf(snapshot);
  return (
    <>
      <View style={styles.hero} accessibilityRole="summary" accessibilityLabel={`Cash to deposit ${hero.cashToDeposit}`}>
        <Text style={styles.eyebrow}>Cash to deposit</Text>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
          {hero.cashToDeposit}
        </Text>
        {hero.lines.map((line) => (
          <View key={line.label} style={styles.heroLine}>
            <Text style={styles.heroLabel}>{line.label}</Text>
            <Text style={styles.heroValue}>{line.value}</Text>
          </View>
        ))}
        {isDrawersOnly ? <Text style={styles.heroNote}>Drawer figures only. Sales totals for this store are in Reports.</Text> : null}
      </View>
      <Rows title="By shift" rows={shiftRowsOf(snapshot)} />
      <Rows title="By named shift" rows={periodRowsOf(snapshot)} />
      {recounts.length > 0 ? (
        <View style={styles.card}>
          {recounts.map((line) => (
            <View key={line} style={styles.recount}>
              <Icon name="repeat" size={16} color={colors.statusPending.text} />
              <Text style={styles.recountText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xs },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  amount: { fontSize: 40, fontWeight: "800", color: colors.heroInkText, fontVariant: ["tabular-nums"], marginBottom: spacing.sm },
  heroLine: { flexDirection: "row", justifyContent: "space-between", minHeight: 24, alignItems: "center" },
  heroLabel: { ...typography.caption, color: colors.heroInkMuted },
  heroValue: { ...typography.body, color: colors.heroInkText, fontVariant: ["tabular-nums"] },
  heroNote: { ...typography.caption, color: colors.heroInkMuted, marginTop: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  heading: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
  row: { paddingVertical: spacing.sm, gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.separator },
  rowTitle: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  rowDetail: { ...typography.caption, color: colors.textMuted },
  recount: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 32 },
  recountText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
});
