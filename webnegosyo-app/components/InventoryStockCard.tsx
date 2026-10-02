import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, shadow } from "../theme/colors";
import {
  describeStockView,
  formatStockQuantity,
  stockFillRatio,
  type StockItemView,
} from "../lib/inventory-stock";
import { valueOf } from "../lib/inventory-insights";
import { formatPeso } from "../lib/format";
import { LEVEL_STYLE } from "./inventory/level-style";
import { Icon } from "./Icon";

/**
 * The reorder level sits at the midpoint of the bar (see `stockFillRatio`), so
 * the marker is drawn at exactly 50%. Hard-coding it here keeps the tick and
 * the fill from ever drifting apart.
 */
const REORDER_MARK = "50%";

interface InventoryStockCardProps {
  item: StockItemView;
  /** Absent leaves the card inert. */
  onPress?: (item: StockItemView) => void;
}

/** "Bread flour" → "BF"; one word → its first two letters. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * One ingredient on the shelf.
 *
 * Built to be judged by shape: a tinted monogram says the level before the
 * name is read, the quantity is the headline because it is the number acted
 * on, and the bar — with its reorder tick — lets twenty rows be scanned rather
 * than read. Every judgement comes from lib/inventory-stock.ts, so this file
 * cannot hold a second opinion about what "low" means.
 */
export function InventoryStockCard({ item, onPress }: InventoryStockCardProps) {
  const level = LEVEL_STYLE[item.level];
  const ratio = stockFillRatio(item);
  const hasThreshold = item.reorderLevel > 0;
  const worth = valueOf(item);
  const meta = [item.category?.trim() || null, worth > 0 ? formatPeso(worth, 0) : null]
    .filter(Boolean)
    .join("  ·  ");

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={styles.card}
      accessible
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? `${describeStockView(item)}. Tap for details.` : describeStockView(item)
      }
      onPress={onPress ? () => onPress(item) : undefined}
      activeOpacity={0.75}
    >
      <View style={styles.row}>
        <View style={[styles.monogram, { backgroundColor: level.tint }]}>
          <Text style={[styles.monogramText, { color: level.text }]}>{monogram(item.name)}</Text>
        </View>

        <View style={styles.copy}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isPrep && (
              <View style={styles.prepTag}>
                <Text style={styles.prepText}>PREP</Text>
              </View>
            )}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {meta || (hasThreshold ? `Reorder at ${formatStockQuantity(item.reorderLevel, item.unitAbbreviation)}` : "No reorder level")}
          </Text>
        </View>

        <View style={styles.figure}>
          <Text
            style={[styles.quantity, item.level === "out" && { color: level.fill }]}
            numberOfLines={1}
          >
            {item.level === "out" ? "Out" : formatStockQuantity(item.quantity, "")}
          </Text>
          <Text style={[styles.unit, { color: item.level === "ok" ? colors.textTertiary : level.text }]}>
            {item.level === "out" ? "of stock" : item.unitAbbreviation || level.label}
          </Text>
        </View>

        {onPress && <Icon name="chevron" size={16} color={colors.textTertiary} />}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + 2,
    paddingBottom: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  monogram: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  copy: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  prepTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
  },
  prepText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, color: colors.textSecondary },
  meta: { fontSize: 12, color: colors.textSecondary },
  figure: { alignItems: "flex-end", minWidth: 56 },
  quantity: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3, color: colors.textPrimary },
  unit: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  track: {
    height: 5,
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
  },
});
