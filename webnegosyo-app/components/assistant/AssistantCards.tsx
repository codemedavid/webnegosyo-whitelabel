import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../theme/colors";
import type { AssistantCard, BarsCard, RankedCard, StatsCard } from "../../lib/assistant/types";

/** Bar chart height in points (web: h-28 with a 96px tallest bar). */
const BAR_AREA_HEIGHT = 112;
const TALLEST_BAR = 96;
const SHORTEST_BAR = 2;

function CardShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const isUp = value >= 0;
  return (
    <Text style={[styles.change, { color: isUp ? colors.success : colors.danger }]}>
      {isUp ? "↗" : "↘"}
      {Math.abs(value)}%
    </Text>
  );
}

function StatsView({ card }: { card: StatsCard }) {
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      <View style={styles.statGrid}>
        {card.items.map((item) => (
          <View key={item.label} style={styles.statCell}>
            <Text style={styles.statLabel}>{item.label}</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Change value={item.change} />
            </View>
            {item.hint ? <Text style={styles.statHint}>{item.hint}</Text> : null}
          </View>
        ))}
      </View>
    </CardShell>
  );
}

function RankedView({ card }: { card: RankedCard }) {
  if (card.rows.length === 0) {
    return (
      <CardShell title={card.title} subtitle={card.subtitle}>
        <Text style={styles.emptyText}>{card.emptyText ?? "Nothing to show."}</Text>
      </CardShell>
    );
  }
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      {card.rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={[styles.rankRow, index > 0 && styles.rankDivider]}>
          <Text style={styles.rankIndex}>{index + 1}</Text>
          <View style={styles.rankBody}>
            <View style={styles.rankLabelRow}>
              <Text style={styles.rankLabel} numberOfLines={1}>
                {row.label}
              </Text>
              {row.badge ? <Text style={styles.badge}>{row.badge}</Text> : null}
            </View>
            {row.detail ? (
              <Text style={styles.rankDetail} numberOfLines={1}>
                {row.detail}
              </Text>
            ) : null}
          </View>
          <Text style={styles.rankValue}>{row.value}</Text>
        </View>
      ))}
    </CardShell>
  );
}

function BarsView({ card }: { card: BarsCard }) {
  const max = Math.max(1, ...card.bars.map((bar) => bar.value));
  const first = card.bars[0]?.label;
  const last = card.bars[card.bars.length - 1]?.label;
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      <View style={styles.barArea} accessibilityRole="image" accessibilityLabel={card.title}>
        {card.bars.map((bar) => (
          <View key={bar.label} style={styles.barColumn}>
            <View
              style={[
                styles.bar,
                { height: Math.max(SHORTEST_BAR, (bar.value / max) * TALLEST_BAR) },
                bar.isHighlight ? styles.barHighlight : null,
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.barAxis}>
        <Text style={styles.axisText}>{first}</Text>
        <Text style={styles.axisText}>{last}</Text>
      </View>
    </CardShell>
  );
}

/** Renders a tool's card. Unknown shapes (an older stored message) render nothing rather than crash. */
export function AssistantCardView({ card }: { card: AssistantCard | undefined }) {
  if (!card || typeof card !== "object") return null;
  switch (card.type) {
    case "stats":
      return Array.isArray(card.items) ? <StatsView card={card} /> : null;
    case "ranked":
      return Array.isArray(card.rows) ? <RankedView card={card} /> : null;
    case "bars":
      return Array.isArray(card.bars) ? <BarsView card={card} /> : null;
    // Interactive; rendered by ConfirmCardView, which needs the store context.
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 14, fontWeight: "800", letterSpacing: -0.1, color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCell: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSubtle, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  statLabel: { fontSize: 11, fontWeight: "500", color: colors.textSecondary },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  statHint: { fontSize: 11, color: colors.textSecondary },
  change: { fontSize: 11, fontWeight: "600" },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rankDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rankIndex: { width: 16, fontSize: 12, fontWeight: "600", color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  rankBody: { flex: 1, minWidth: 0 },
  rankLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankLabel: { flexShrink: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  badge: { fontSize: 10, fontWeight: "600", color: "#92400E", backgroundColor: colors.warningLight, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
  rankDetail: { fontSize: 11, color: colors.textSecondary },
  rankValue: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  barArea: { height: BAR_AREA_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: "#D4D4D4" },
  barHighlight: { backgroundColor: colors.accent },
  barAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { fontSize: 10, color: colors.textSecondary },
});
