import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { TimelineEntry, TimelineTone } from "../../../lib/expenses/expense-detail";
import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Icon } from "../../Icon";

interface HistoryTimelineProps {
  entries: readonly TimelineEntry[];
  onOpenExpense: (expenseId: string) => void;
}

const DOT: Record<TimelineTone, string> = {
  good: colors.success,
  neutral: colors.textTertiary,
  danger: colors.danger,
};
const DOT_SIZE = 10;

/** What happened to the expense, oldest first: a dot per step joined by a line. */
export function HistoryTimeline({ entries, onOpenExpense }: HistoryTimelineProps) {
  return (
    <View style={styles.card}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const link = entry.linkExpenseId;
        return (
          <TouchableOpacity
            key={entry.key}
            style={styles.step}
            disabled={!link}
            onPress={() => link && onOpenExpense(link)}
            accessibilityRole={link ? "link" : "text"}
            accessibilityLabel={entry.when ? `${entry.text}, ${entry.when}` : entry.text}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: DOT[entry.tone] }]} />
              {!isLast ? <View style={styles.line} /> : null}
            </View>
            <View style={[styles.copy, !isLast && styles.copyGap]}>
              <Text style={styles.text}>{entry.text}</Text>
              {entry.when ? <Text style={styles.when}>{entry.when}</Text> : null}
            </View>
            {link ? <Icon name="chevron" size={16} color={colors.textSecondary} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm, padding: spacing.lg },
  step: { flexDirection: "row", gap: spacing.md, minHeight: 44 },
  rail: { width: DOT_SIZE, alignItems: "center", paddingTop: 5 },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: radius.full },
  line: { flex: 1, width: 2, marginTop: 4, borderRadius: radius.full, backgroundColor: colors.separator },
  copy: { flex: 1, gap: 2 },
  copyGap: { paddingBottom: spacing.md },
  text: { ...typography.body, color: colors.textPrimary },
  when: { ...typography.caption, color: colors.textMuted },
});
