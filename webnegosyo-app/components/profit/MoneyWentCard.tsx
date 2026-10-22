import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { categoryLook, groupTone } from "../../lib/expenses/category-look";
import { formatPesoShort } from "../../lib/expenses/money-text";
import type { ProfitReport } from "../../lib/profit/profit-model";
import { formatMoney, moneyBars } from "../../lib/profit/profit-view";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { CategoryTile } from "../expenses/CategoryTile";
import { Icon } from "../Icon";
import { SectionHeader } from "../SectionHeader";
import { profitCard } from "./profit-styles";

interface MoneyRowProps {
  name: string;
  cents: number;
  share: number;
  barColor: string;
  tile: React.ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
}

function MoneyRow({ name, cents, share, barColor, tile, accessibilityLabel, onPress }: MoneyRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {tile}
      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(Math.max(share, 0), 1) * 100}%`, backgroundColor: barColor }]} />
        </View>
      </View>
      <Text style={[styles.value, profitCard.tabular]}>{formatPesoShort(cents)}</Text>
      <Icon name="chevron" size={14} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

interface MoneyWentCardProps {
  report: ProfitReport;
  onOpenCategory: (categoryId: string) => void;
  onOpenAll: () => void;
}

/** Expenses by category, largest first, each bar in its group's colour; a tap opens those expenses for the same days. */
export function MoneyWentCard({ report, onOpenCategory, onOpenAll }: MoneyWentCardProps) {
  const { bars, restCents, restCount } = moneyBars(report);
  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((bar) => bar.cents), restCents);
  const other = groupTone("other");
  return (
    <View>
      <SectionHeader title="Where the money went" actionLabel="All expenses" onAction={onOpenAll} />
      <View style={[profitCard.card, styles.card]}>
        {bars.map((bar) => (
          <MoneyRow
            key={bar.categoryId}
            name={bar.name}
            cents={bar.cents}
            share={bar.cents / max}
            barColor={groupTone(bar.group).ink}
            tile={<CategoryTile look={categoryLook({ systemKey: bar.systemKey, name: bar.name, group: bar.group })} size={22} />}
            accessibilityLabel={`${bar.name}, ${formatMoney(bar.cents)}. Show these expenses`}
            onPress={() => onOpenCategory(bar.categoryId)}
          />
        ))}
        {restCount > 0 ? (
          <MoneyRow
            name={`Other ${restCount}`}
            cents={restCents}
            share={restCents / max}
            barColor={other.ink}
            tile={<CategoryTile look={categoryLook(null)} size={22} />}
            accessibilityLabel={`${restCount} other categories, ${formatMoney(restCents)}. Show all expenses`}
            onPress={onOpenAll}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.sm, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  middle: { flex: 1, gap: 5 },
  name: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  track: { height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full },
  value: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, minWidth: 60, textAlign: "right" },
});
