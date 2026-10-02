import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { healthSegments, type StockValue } from "../../lib/inventory-insights";
import type { StockLevel, StockSummary } from "../../lib/inventory-stock";
import { StockHealthRing } from "./StockHealthRing";
import { LEVEL_STYLE } from "./level-style";

export type LevelFilter = StockLevel | "all";

/** Out first: the segment row reads in the order the ring is drawn. */
const SEGMENT_ORDER: readonly StockLevel[] = ["out", "low", "ok"];

/** Below this the centavos are worth reading; above, they are noise. */
const WHOLE_PESO_THRESHOLD = 1000;

interface InventoryHeroProps {
  summary: StockSummary;
  value: StockValue;
  levelFilter: LevelFilter;
  onToggleLevel: (level: StockLevel) => void;
}

/**
 * The top of the Stock screen: how healthy the shelf is, what it is worth, and
 * the three counts that double as the level filter. A merchant who reads
 * "2 out" and wants to see which two taps the 2.
 */
export function InventoryHero({ summary, value, levelFilter, onToggleLevel }: InventoryHeroProps) {
  const stockedPercent = summary.total > 0 ? Math.round((summary.okCount / summary.total) * 100) : 0;
  const counts: Record<StockLevel, number> = {
    out: summary.outCount,
    low: summary.lowCount,
    ok: summary.okCount,
  };
  const decimals = value.total >= WHOLE_PESO_THRESHOLD ? 0 : 2;

  return (
    <View style={styles.hero}>
      <View style={styles.topRow}>
        <StockHealthRing
          segments={healthSegments(summary)}
          value={`${stockedPercent}%`}
          caption="stocked"
          trackColor={colors.heroInkElevated}
          textColor={colors.heroInkText}
          captionColor={colors.heroInkMuted}
        />

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Stock on hand</Text>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {formatPeso(value.total, decimals)}
          </Text>
          <Text style={styles.subline} numberOfLines={2}>
            {value.uncostedCount > 0
              ? `${value.uncostedCount} without a cost — add one to count them`
              : `Across ${summary.total} ${summary.total === 1 ? "ingredient" : "ingredients"}`}
          </Text>
        </View>
      </View>

      <Text style={styles.headline}>{summary.headline}</Text>

      <View style={styles.segments}>
        {SEGMENT_ORDER.map((level) => {
          const isActive = levelFilter === level;
          const style = LEVEL_STYLE[level];
          return (
            <TouchableOpacity
              key={level}
              style={[styles.segment, isActive && styles.segmentActive]}
              onPress={() => onToggleLevel(level)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${counts[level]} ${style.label}${isActive ? ", filtering" : ""}`}
            >
              <View style={styles.segmentHead}>
                <View style={[styles.dot, { backgroundColor: style.fill }]} />
                <Text style={styles.segmentCount}>{counts[level]}</Text>
              </View>
              <Text style={styles.segmentLabel}>{style.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg + 4,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  copy: { flex: 1, gap: 2 },
  eyebrow: { ...typography.eyebrow, color: colors.heroInkMuted },
  value: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8, color: colors.heroInkText },
  subline: { ...typography.caption, color: colors.heroInkMuted, lineHeight: 18 },
  headline: { fontSize: 15, fontWeight: "700", color: colors.heroInkText, lineHeight: 21 },
  segments: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.md + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segmentActive: { borderColor: colors.tabBarActive },
  segmentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  segmentCount: { fontSize: 20, fontWeight: "800", color: colors.heroInkText },
  segmentLabel: { ...typography.small, color: colors.heroInkMuted, fontWeight: "600" },
});
