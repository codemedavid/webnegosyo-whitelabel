import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing, radius, shadow } from "../../theme/colors";
import { formatCount } from "../../lib/format";
import type { DashboardWindow } from "../../lib/customer-hub/dashboard";
import { SegmentedControl } from "../SegmentedControl";
import { ShareBar } from "../performance/parts";
import { SEGMENT_COLORS } from "./RevenueSplitCard";

type Audience = "returning" | "new";

const AUDIENCE_OPTIONS: readonly { label: string; value: Audience }[] = [
  { label: "Regulars", value: "returning" },
  { label: "First-timers", value: "new" },
];

const EMPTY_COPY: Record<Audience, string> = {
  returning: "No regular has ordered in this period yet.",
  new: "No first-time guest has ordered in this period yet.",
};

/**
 * What keeps regulars coming back, beside what first-timers try. The two lists
 * differ more often than merchants expect: the dish that wins a first visit is
 * the one to put in front of strangers; the one regulars reorder is the one
 * never to run out of.
 */
export function FavouritesCard({ window }: { window: DashboardWindow }) {
  const [audience, setAudience] = useState<Audience>("returning");
  const items = window.favourites[audience];
  const top = items[0]?.quantity ?? 0;

  return (
    <View style={styles.card}>
      <SegmentedControl
        options={AUDIENCE_OPTIONS}
        value={audience}
        onChange={setAudience}
        accessibilityPrefix="Favourites of"
      />
      {items.length === 0 ? (
        <Text style={styles.empty}>{EMPTY_COPY[audience]}</Text>
      ) : (
        items.map((item, index) => (
          <View key={item.key} style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.body}>
              <View style={styles.line}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.count}>{formatCount(item.quantity)} sold</Text>
              </View>
              <ShareBar fraction={top > 0 ? item.quantity / top : 0} color={SEGMENT_COLORS[audience]} />
            </View>
          </View>
        ))
      )}
    </View>
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
  empty: { ...typography.caption, color: colors.textSecondary, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rank: {
    ...typography.caption,
    width: 18,
    fontWeight: "800",
    color: colors.textTertiary,
    textAlign: "center",
  },
  body: { flex: 1, gap: spacing.xs },
  line: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  name: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  count: { ...typography.caption, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
});
