import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../theme/colors";
import {
  describeStockView,
  formatStockQuantity,
  stockFillRatio,
  type StockItemView,
  type StockLevel,
} from "../lib/inventory-stock";

/**
 * The reorder level sits at the midpoint of the bar (see `stockFillRatio`), so
 * the marker is drawn at exactly 50%. Hard-coding it here keeps the tick and
 * the fill from ever drifting apart.
 */
const REORDER_MARK = "50%";

const LEVEL_STYLE: Record<StockLevel, { label: string; fill: string; text: string; chip: string }> =
  {
    out: { label: "Out", fill: colors.danger, text: colors.statusCancelled.text, chip: colors.dangerLight },
    low: { label: "Low", fill: colors.warning, text: colors.statusPending.text, chip: colors.warningLight },
    ok: { label: "Stocked", fill: colors.success, text: colors.statusReady.text, chip: colors.successLight },
  };

interface InventoryStockCardProps {
  item: StockItemView;
  /** Absent leaves the card inert, as it was before stock could be recorded. */
  onPress?: (item: StockItemView) => void;
}

/**
 * One ingredient on the shelf.
 *
 * The quantity is the headline because it is the number a merchant acts on;
 * the bar exists so a shelf of twenty ingredients can be judged by shape rather
 * than read line by line. Every judgement about the ingredient — its level, its
 * fill, its wording — comes from lib/inventory-stock.ts, so this file cannot
 * hold a second opinion about what "low" means.
 */
export function InventoryStockCard({ item, onPress }: InventoryStockCardProps) {
  const level = LEVEL_STYLE[item.level];
  const ratio = stockFillRatio(item);
  const hasThreshold = item.reorderLevel > 0;

  // The whole card is the target rather than a separate button: on a phone the
  // merchant is holding the ingredient, and the thing they want to do to it is
  // the only thing this card is for.
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={styles.card}
      accessible
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? `${describeStockView(item)}. Tap to record stock.` : describeStockView(item)
      }
      onPress={onPress ? () => onPress(item) : undefined}
    >
      <View style={styles.headRow}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.chip, { backgroundColor: level.chip }]}>
          <Text style={[styles.chipText, { color: level.text }]}>{level.label}</Text>
        </View>
      </View>

      <View style={styles.quantityRow}>
        <Text style={[styles.quantity, item.level === "out" && styles.quantityMuted]}>
          {item.level === "out"
            ? "Nothing left"
            : formatStockQuantity(item.quantity, item.unitAbbreviation)}
        </Text>
        {hasThreshold && (
          <Text style={styles.threshold}>
            reorder at {formatStockQuantity(item.reorderLevel, item.unitAbbreviation)}
          </Text>
        )}
      </View>

      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: level.fill }]}
        />
        {/* The tick is what makes the bar readable on its own: without it there
            is no way to see where "enough" is. */}
        {hasThreshold && <View style={[styles.reorderMark, { left: REORDER_MARK }]} />}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  chipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  quantityRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  quantity: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  quantityMuted: { fontSize: 17, color: colors.textSecondary },
  threshold: { ...typography.caption, color: colors.textTertiary, marginLeft: "auto" },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.full },
  reorderMark: {
    position: "absolute",
    width: 2,
    top: 0,
    bottom: 0,
    backgroundColor: colors.card,
    opacity: 0.9,
  },
});
