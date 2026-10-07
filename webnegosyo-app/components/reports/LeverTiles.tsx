import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import type { LeverChange, LeverTile } from "../../lib/customer-hub/dashboard";
import { Icon } from "../Icon";

interface LeverTilesProps {
  tiles: readonly LeverTile[];
}

/**
 * Customers, came back, spend per order: the three dials behind the total.
 * Same size, same order, every visit — so the eye learns where each one lives
 * and only has to read the arrows.
 */
export function LeverTiles({ tiles }: LeverTilesProps) {
  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View
          key={tile.label}
          style={styles.tile}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}. ${describeChange(tile.change)}`}
        >
          <Text style={styles.label} numberOfLines={1}>
            {tile.label}
          </Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {tile.value}
          </Text>
          <ChangeChip change={tile.change} />
          <Text style={styles.hint} numberOfLines={2}>
            {tile.hint}
          </Text>
        </View>
      ))}
    </View>
  );
}

function changeText(change: LeverChange): string {
  if (change.kind === "points") return `${Math.abs(change.value)} pts`;
  return `${Math.abs(Math.round(change.value * 100))}%`;
}

function roundedValue(change: LeverChange): number {
  return change.kind === "points" ? change.value : Math.round(change.value * 100);
}

function describeChange(change: LeverChange | null): string {
  if (change === null) return "Nothing to compare with.";
  const value = roundedValue(change);
  if (value === 0) return "No change.";
  return `${value > 0 ? "Up" : "Down"} ${changeText(change)}.`;
}

function ChangeChip({ change }: { change: LeverChange | null }) {
  if (change === null) return <Text style={[styles.change, styles.flat]}>—</Text>;
  const value = roundedValue(change);
  if (value === 0) return <Text style={[styles.change, styles.flat]}>No change</Text>;
  const isUp = value > 0;
  const color = isUp ? colors.success : colors.danger;
  return (
    <View style={styles.changeRow}>
      <Icon name={isUp ? "arrow-up" : "arrow-down"} size={12} color={color} strokeWidth={2.5} />
      <Text style={[styles.change, { color }]}>{changeText(change)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  label: { ...typography.small, color: colors.textSecondary, fontWeight: "700" },
  value: { ...typography.title, fontSize: 22, color: colors.textPrimary, marginTop: spacing.xs },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  change: { ...typography.small, fontWeight: "800", marginTop: 2 },
  flat: { color: colors.textTertiary },
  hint: { ...typography.small, color: colors.textTertiary, marginTop: spacing.xs },
});
