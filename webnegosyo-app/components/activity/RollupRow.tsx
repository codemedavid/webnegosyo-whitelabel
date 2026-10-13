import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { describeActivity } from "../../lib/activity/describe";
import type { RollupItem } from "../../lib/activity/feed-groups";
import { formatManilaTime } from "../../lib/activity/format";
import { colors, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

/** Lines an expanded roll-up shows before it says how many more there are. */
const EXPANDED_LIMIT = 10;

interface RollupRowProps {
  item: RollupItem;
  onToggle: (key: string) => void;
}

/**
 * A day's routine events of one family, folded into one row ("Stock used by
 * 38 orders"). Tapping expands it in place — no navigation (spec §3.1).
 */
function RollupRowBase({ item, onToggle }: RollupRowProps) {
  const handlePress = useCallback(() => onToggle(item.key), [onToggle, item.key]);
  const shown = item.isExpanded ? item.events.slice(0, EXPANDED_LIMIT) : [];
  const more = item.events.length - shown.length;
  const label = `${item.title}. ${item.lines.join(". ")}. ${item.isExpanded ? "Expanded" : "Collapsed"}.`;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: item.isExpanded }}
        accessibilityHint={item.isExpanded ? "Hides the events" : "Shows the events"}
      >
        <View style={styles.tile}>
          <Text style={styles.count} numberOfLines={1} allowFontScaling={false}>
            ×{item.count}
          </Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.lines.map((line) => (
            <Text key={line} style={styles.line} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
        <Icon name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {shown.map((event) => (
        <View key={event.id} style={styles.detail}>
          <Text style={styles.detailText} numberOfLines={1}>
            {describeActivity(event).title}
          </Text>
          <Text style={styles.detailTime}>{formatManilaTime(event.occurredAt)}</Text>
        </View>
      ))}
      {item.isExpanded && more > 0 ? <Text style={styles.more}>and {more} more</Text> : null}
    </View>
  );
}

export const RollupRow = memo(RollupRowBase);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: colors.separator,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceSubtle },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { fontSize: 12, fontWeight: "800", color: colors.textPrimary },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  line: { ...typography.caption, color: colors.textMuted },
  detail: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingLeft: spacing.lg + 40 + spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  detailText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  detailTime: { ...typography.caption, color: colors.textMuted },
  more: {
    ...typography.caption,
    color: colors.textMuted,
    paddingLeft: spacing.lg + 40 + spacing.md,
    paddingBottom: spacing.md,
  },
});
