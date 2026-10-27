import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { profitCard } from "./profit-styles";

const SKELETON_FALL_ROWS = [1, 0.36, 0.42, 0.22];

/** The hero and tiles' shapes while the first read is in flight; the header and period stay usable. */
export function ProfitSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityLabel="Loading profit" accessibilityRole="progressbar">
      <View style={styles.hero}>
        <View style={[styles.inkBlock, { width: "48%", height: 10 }]} />
        <View style={[styles.inkBlock, { width: "62%", height: 40, marginTop: spacing.sm }]} />
        <View style={[styles.inkBlock, { width: "80%", height: 12, marginTop: spacing.sm }]} />
        <View style={styles.fall}>
          {SKELETON_FALL_ROWS.map((width, index) => (
            <View key={index} style={styles.fallRow}>
              <View style={[styles.inkBlock, { width: 60, height: 10 }]} />
              <View style={styles.inkTrack}>
                <View style={[styles.inkBlock, { width: `${width * 100}%`, height: 10 }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.tiles}>
        {[0, 1, 2].map((key) => (
          <View key={key} style={styles.tile} />
        ))}
      </View>
    </View>
  );
}

interface FirstRunCardProps {
  onAdd: () => void;
  /** The second way in: rent, kuryente and sahod as Bills to pay. */
  onSetUpBills?: () => void;
}

/** Before the first expense: what profit is, and the ways to start. */
export function FirstRunCard({ onAdd, onSetUpBills }: FirstRunCardProps) {
  return (
    <View style={profitCard.card}>
      <Text style={profitCard.title}>Profit is sales, minus ingredients, minus expenses</Text>
      <Text style={styles.body}>We already know your sales. Add your first expense and we’ll do the math.</Text>
      <Button label="Add expense" icon="plus" onPress={onAdd} style={styles.firstRunButton} />
      {onSetUpBills ? (
        <Button label="Set up monthly bills" icon="calendar" tone="secondary" onPress={onSetUpBills} testID="profit-first-run-bills" />
      ) : null}
    </View>
  );
}

/** Cached figures are on screen but the refresh failed: say so quietly, with a retry. */
export function RefreshBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="warning" size={16} color={colors.statusPending.text} />
      <Text style={styles.bannerText}>Couldn’t refresh. These figures are from the last time it loaded.</Text>
      <Button label="Try again" onPress={onRetry} tone="ghost" size="sm" fullWidth={false} />
    </View>
  );
}

const INK_BLOCK = "rgba(253,251,247,0.10)";

const styles = StyleSheet.create({
  skeleton: { gap: spacing.md },
  hero: { backgroundColor: colors.heroInk, borderRadius: radius.lg, padding: spacing.xl, ...shadow.md },
  inkBlock: { backgroundColor: INK_BLOCK, borderRadius: radius.sm },
  fall: { gap: spacing.sm, marginTop: spacing.lg },
  fallRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inkTrack: { flex: 1 },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, height: 104, borderRadius: radius.lg, backgroundColor: colors.card, ...shadow.sm },
  body: { ...typography.body, color: colors.textSecondary },
  firstRunButton: { marginTop: spacing.xs },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  bannerText: { ...typography.caption, color: colors.statusPending.text, flex: 1, paddingVertical: spacing.sm },
});
