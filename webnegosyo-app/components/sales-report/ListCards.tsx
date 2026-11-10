import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ChangeLine, ShareRow } from "../../lib/sales-report/overview-view";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";

interface ShareListCardProps {
  title: string;
  rows: readonly ShareRow[];
  emptyText: string;
  /** A ranked list (1, 2, 3…) or a plain mix. */
  isRanked?: boolean;
  footerLabel?: string;
  onFooter?: () => void;
}

/** A ranked or mixed list with each row's share drawn as a bar under it. */
export function ShareListCard({ title, rows, emptyText, isRanked = false, footerLabel, onFooter }: ShareListCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.empty}>{emptyText}</Text> : null}
      {rows.map((row, index) => (
        <View key={row.key} style={styles.row} accessible accessibilityLabel={`${row.label}, ${row.valueText}, ${Math.round(row.share * 100)}%${row.detail ? `, ${row.detail}` : ""}`}>
          <View style={styles.rowTop}>
            {isRanked ? <Text style={styles.rank}>{index + 1}</Text> : null}
            <Text style={styles.label} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={styles.value}>{row.valueText}</Text>
          </View>
          <View style={[styles.rowBottom, isRanked && styles.indented]}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(row.share * 100)}%` }]} />
            </View>
            <Text style={styles.detail}>{row.detail ?? `${Math.round(row.share * 100)}%`}</Text>
          </View>
        </View>
      ))}
      {footerLabel && onFooter ? (
        <TouchableOpacity style={styles.footer} onPress={onFooter} accessibilityRole="button">
          <Text style={styles.footerText}>{footerLabel}</Text>
          <Icon name="chevron" size={16} color={colors.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const TONE_DOT = { good: colors.success, bad: colors.danger, neutral: colors.textTertiary } as const;

interface ChangesCardProps {
  lines: readonly ChangeLine[];
  onOpen: (target: NonNullable<ChangeLine["target"]>) => void;
}

/** "What changed": a few plain sentences, each with its numbers. */
export function ChangesCard({ lines, onOpen }: ChangesCardProps) {
  if (lines.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>What changed</Text>
      {lines.map((line) => {
        const content = (
          <>
            <View style={[styles.dot, { backgroundColor: TONE_DOT[line.tone] }]} />
            <Text style={styles.sentence}>{line.text}</Text>
            {line.target ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null}
          </>
        );
        return line.target ? (
          <TouchableOpacity key={line.key} style={styles.change} onPress={() => onOpen(line.target as NonNullable<ChangeLine["target"]>)} accessibilityRole="button">
            {content}
          </TouchableOpacity>
        ) : (
          <View key={line.key} style={styles.change}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  title: { ...typography.heading, color: colors.textPrimary },
  empty: { ...typography.body, color: colors.textMuted },
  row: { gap: spacing.xs },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rank: { ...typography.caption, fontWeight: "800", color: colors.textMuted, width: 18 },
  label: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
  value: { ...typography.body, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  indented: { paddingLeft: 26 },
  track: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceSubtle, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.accent },
  detail: { ...typography.caption, color: colors.textMuted, minWidth: 64, textAlign: "right" },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  footerText: { ...typography.caption, fontWeight: "700", color: colors.accent },
  change: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sentence: { ...typography.body, color: colors.textPrimary, flex: 1 },
});
