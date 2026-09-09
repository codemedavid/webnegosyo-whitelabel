import React, { memo, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import { formatPeso, formatCount } from "../lib/format";

/** One product on the lifetime (BCG) list of the Performance screen. */
export interface ProductLifetimeItem {
  menuItemId: string;
  menuItemName?: string;
  totalUnitsSold: number;
  totalRevenue: number;
  marginPercent?: number;
  bcgClassification: string;
}

export interface BcgPresentation {
  label: string;
  color: string;
  bg: string;
}

export const BCG_PRESENTATION: Record<string, BcgPresentation> = {
  star: { label: "Star", color: colors.statusPending.text, bg: colors.warningLight },
  plowhorse: { label: "Plowhorse", color: colors.info, bg: colors.infoLight },
  puzzle: { label: "Puzzle", color: colors.accent, bg: colors.accentLight },
  dog: { label: "Dog", color: colors.danger, bg: colors.dangerLight },
  unclassified: { label: "No data", color: colors.textSecondary, bg: colors.surfaceSubtle },
};

/** A product that sold at all still shows a sliver of bar. */
const MIN_VISIBLE_BAR_PCT = 4;

/** Bar width as a share of the top seller's revenue. */
export function revenueBarPercent(totalRevenue: number, maxRevenue: number): number {
  const share = (totalRevenue / (maxRevenue || 1)) * 100;
  return Math.max(share, totalRevenue > 0 ? MIN_VISIBLE_BAR_PCT : 0);
}

interface ProductLifetimeRowProps {
  item: ProductLifetimeItem;
  /** 1-based position in the ranked list. */
  rank: number;
  /** The list leader's revenue, hoisted so a hundred rows do not each re-read it. */
  maxRevenue: number;
  onPress: (item: ProductLifetimeItem) => void;
}

function ProductLifetimeRowComponent({ item, rank, maxRevenue, onPress }: ProductLifetimeRowProps) {
  const bcg = BCG_PRESENTATION[item.bcgClassification] ?? BCG_PRESENTATION.unclassified;
  const barPct = revenueBarPercent(item.totalRevenue, maxRevenue);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.menuItemName}, ${formatPeso(item.totalRevenue)} revenue, set cost price`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rank}>#{rank}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {item.menuItemName}
        </Text>
        <View style={[styles.bcgBadge, { backgroundColor: bcg.bg }]}>
          <Text style={[styles.bcgText, { color: bcg.color }]}>{bcg.label}</Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barPct}%` }]} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaStrong}>{formatPeso(item.totalRevenue)}</Text>
        <Text style={styles.metaText}>
          {formatCount(item.totalUnitsSold)} sold
          {item.marginPercent !== undefined
            ? ` · ${item.marginPercent.toFixed(0)}% margin`
            : " · tap to add cost"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export const ProductLifetimeRow = memo(ProductLifetimeRowComponent);

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, color: colors.textTertiary, fontWeight: "700", width: 28 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: "600", flex: 1 },
  bcgBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  bcgText: { fontSize: 10, fontWeight: "700" },
  barTrack: {
    height: 5,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 3,
    marginTop: spacing.sm,
  },
  barFill: { height: 5, backgroundColor: colors.accent, borderRadius: 3 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  metaStrong: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  metaText: { ...typography.caption, color: colors.textSecondary },
});
