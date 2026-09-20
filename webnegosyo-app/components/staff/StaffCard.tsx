import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatPeso } from "../../lib/format";
import { formatLastActive, formatShiftLength } from "../../lib/staff-format";
import { activityCount, type StaffDirectoryEntry } from "../../lib/staff-activity/staff-directory";
import { describePermissions } from "../../lib/team-roster";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { StaffAvatar } from "./StaffAvatar";

/**
 * One colleague, as the owner scans the team.
 *
 * The card carries only what separates this person from the one below them —
 * are they on the counter right now, what did they ring up, when were they
 * last seen — and hands everything else to their own screen. Management is
 * deliberately NOT here: a card that can change someone's permissions while
 * you are scrolling is a card you cannot scroll.
 */

interface StaffCardProps {
  entry: StaffDirectoryEntry;
  /** Branch name, already resolved. Omitted on a single-branch store. */
  branchName?: string;
  isSelf: boolean;
  nowMs: number;
  onPress: () => void;
}

/** `describePermissions` renders an empty grant list as an empty string. */
function permissionLabel(permissions: readonly string[] | null): string {
  if (permissions !== null && permissions.length === 0) return "No access yet";
  return describePermissions(permissions);
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StaffCard({ entry, branchName, isSelf, nowMs, onPress }: StaffCardProps) {
  const isOnShift = entry.openShift !== null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, open profile`}
    >
      {/* A quiet status rail, as on the branch cards: the eye finds whoever is
          on the floor without reading any of the names. */}
      <View style={[styles.rail, isOnShift && styles.railOn]} />

      <View style={styles.body}>
        <View style={styles.header}>
          <StaffAvatar name={entry.name} seed={entry.userId} />
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>
              {entry.name}
              {isSelf ? " (you)" : ""}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {entry.email ?? "No email on file"}
            </Text>
          </View>
          <Icon name="chevron" size={16} color={colors.textTertiary} />
        </View>

        <View style={styles.tags}>
          {isOnShift ? (
            <View style={[styles.tag, styles.tagOn]}>
              <View style={styles.dot} />
              <Text style={[styles.tagText, styles.tagTextOn]}>On shift</Text>
            </View>
          ) : null}
          {entry.isOwner ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Owner</Text>
            </View>
          ) : null}
          {entry.isFormer ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Former</Text>
            </View>
          ) : null}
          {branchName ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{branchName}</Text>
            </View>
          ) : null}
          {!entry.isFormer && !entry.isOwner ? (
            <View style={styles.tag}>
              <Text style={styles.tagText} numberOfLines={1}>
                {permissionLabel(entry.permissions)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.figures}>
          <Figure label="Rang up" value={formatPeso(entry.activity.posSalesTotal, 0)} />
          <Figure label="Orders" value={String(activityCount(entry.activity))} />
          <Figure
            label="On the floor"
            value={entry.shifts.count === 0 ? "—" : formatShiftLength(entry.shifts.workedMs)}
          />
        </View>

        <Text style={styles.footer} numberOfLines={1}>
          {isOnShift ? "On the counter now" : formatLastActive(entry.lastActiveAt, nowMs)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  rail: { width: 4, backgroundColor: "transparent" },
  railOn: { backgroundColor: colors.success },
  body: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identity: { flex: 1, gap: 2 },
  name: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  tagOn: { backgroundColor: colors.successLight },
  tagText: { ...typography.small, fontWeight: "600", color: colors.textSecondary },
  tagTextOn: { color: colors.success },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  figures: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
  },
  figure: { flex: 1, gap: 2 },
  figureValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  figureLabel: { ...typography.small, color: colors.textTertiary },
  footer: { ...typography.small, color: colors.textSecondary },
});
