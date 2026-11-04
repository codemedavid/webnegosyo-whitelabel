import React, { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";

import type { TrendBar } from "../../lib/profit/profit-service";
import { trendColumns, type TrendColumn } from "../../lib/profit/profit-trend-view";
import { colors, spacing, typography } from "../../theme/colors";
import { SectionHeader } from "../SectionHeader";
import { profitCard } from "./profit-styles";

const CHART_HEIGHT = 112;
const MIN_BAR = 2;
const STRIPE = 6;

/** Two-tone diagonal stripes: the bucket is still running, so its bar is not final. */
function Hatch({ color }: { color: string }) {
  const id = `profit-hatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={STRIPE} height={STRIPE} patternTransform="rotate(45)">
          <Rect width={STRIPE} height={STRIPE} fill={color} opacity={0.35} />
          <Line x1={0} y1={0} x2={0} y2={STRIPE} stroke={color} strokeWidth={STRIPE} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function Bar({ column, half }: { column: TrendColumn; half: number }) {
  const color = column.isLoss ? colors.danger : colors.success;
  const height = Math.max(MIN_BAR, column.profitShare * half);
  return (
    <View style={[styles.bar, { height, backgroundColor: column.isIncomplete ? "transparent" : color }]}>
      {column.isIncomplete ? <Hatch color={color} /> : null}
    </View>
  );
}

function Column({ column, half, hasLoss }: { column: TrendColumn; half: number; hasLoss: boolean }) {
  return (
    <View style={styles.column} accessible accessibilityLabel={column.spoken}>
      <View style={[styles.top, { height: half }]}>
        <View style={[styles.sales, { height: column.salesShare * half }]} />
        {!column.isLoss ? <Bar column={column} half={half} /> : null}
      </View>
      {hasLoss ? (
        <View style={[styles.bottom, { height: half }]}>{column.isLoss ? <Bar column={column} half={half} /> : null}</View>
      ) : null}
      <Text style={[styles.label, column.isIncomplete && styles.labelOpen]} numberOfLines={1}>
        {column.label}
      </Text>
    </View>
  );
}

interface ProfitTrendCardProps {
  bars: readonly TrendBar[];
  /** "Last 6 weeks", "Last 3 months", "Day by day" (lib/profit/profit-period.ts `trendPlan`). */
  title: string;
}

/** Profit per period, the chosen one last, sales faint behind, losses below the line, the running one striped. */
export function ProfitTrendCard({ bars, title }: ProfitTrendCardProps) {
  if (bars.length < 2) return null;
  const { columns, hasLoss } = trendColumns(bars);
  const half = hasLoss ? CHART_HEIGHT / 2 : CHART_HEIGHT;
  const hasOpen = columns.some((column) => column.isIncomplete);
  return (
    <View>
      <SectionHeader
        title={title}
        hint={hasOpen ? "Kept, with sales behind it. The striped bar is still running." : "Kept, with sales behind it."}
      />
      <View style={profitCard.card}>
        <View style={styles.chart}>
          {columns.map((column) => (
            <Column key={column.key} column={column} half={half} hasLoss={hasLoss} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  column: { flex: 1, alignItems: "center" },
  top: { alignSelf: "stretch", alignItems: "center", justifyContent: "flex-end" },
  bottom: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  sales: {
    position: "absolute",
    bottom: 0,
    width: "86%",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: colors.surfaceSubtle,
  },
  bar: { width: "58%", borderRadius: 4, overflow: "hidden" },
  label: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs, fontVariant: ["tabular-nums"] },
  labelOpen: { fontWeight: "700", color: colors.textPrimary },
});
