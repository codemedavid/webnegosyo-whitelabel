import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import type { ActivityItem } from "../../lib/sms-automations/api";
import { showsReason, statusTone, type StatusTone } from "../../lib/sms-automations/activity";
import { activityStatusLabel, phoneEndingText, skipReasonText, timeAgoText } from "../../lib/sms-automations/view";

const CHIP: Record<StatusTone, { bg: string; fg: string }> = {
  good: { bg: colors.successLight, fg: colors.success },
  waiting: { bg: colors.warningLight, fg: colors.statusPending.text },
  bad: { bg: colors.dangerLight, fg: colors.danger },
  muted: { bg: colors.surfaceSubtle, fg: colors.textSecondary },
};

interface ActivityRowProps {
  item: ActivityItem;
  now: number;
  grouped: boolean;
}

/** One text: who, what it said (two lines, tap for all), what became of it, and when. */
export function ActivityRow({ item, now, grouped }: ActivityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const chip = CHIP[statusTone(item.status)];
  const when = timeAgoText(item.sentAt ?? (item.status === "queued" ? item.notBefore : item.createdAt), now);
  const who = `${item.guestName?.trim() || "Guest"}, ${phoneEndingText(item.phoneLast4)}`;
  const status = activityStatusLabel(item.status);
  return (
    <TouchableOpacity
      style={[styles.row, grouped && styles.grouped]}
      onPress={() => setIsExpanded((value) => !value)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      accessibilityLabel={`${who}. ${status}. ${when}. ${item.body}`}
    >
      <View style={styles.top}>
        <Text style={styles.who} numberOfLines={1}>{who}</Text>
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[styles.chipText, { color: chip.fg }]}>{status}</Text>
        </View>
      </View>
      <Text style={styles.body} numberOfLines={isExpanded ? undefined : 2}>{item.body}</Text>
      <View style={styles.meta}>
        {showsReason(item.status) ? (
          <Text style={styles.reason} numberOfLines={1}>{skipReasonText(item.reason)}</Text>
        ) : (
          <View style={styles.spacer} />
        )}
        <Text style={styles.when}>{when}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  grouped: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  who: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  chipText: { ...typography.small, fontWeight: "700" },
  body: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reason: { ...typography.small, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  spacer: { flex: 1 },
  when: { ...typography.small, color: colors.textSecondary },
});
