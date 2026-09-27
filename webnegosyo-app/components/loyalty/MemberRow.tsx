import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  describeBalance,
  describeMemberStatus,
  type LoyaltyMember,
} from "../../lib/loyalty/members";
import { describeNextCard, MemberProgressBar } from "./MemberProgress";
import { TONE_COLORS } from "./tone-colors";


/** A guest with no name on file is still a real customer, not a blank row. */
function displayName(member: LoyaltyMember): string {
  return member.name?.trim() || member.phone || "Guest";
}

/**
 * One member, as the list reads them.
 *
 * The counter and "how many more" both appear: the counter is the fact the
 * merchant reads back to the customer at the counter, and the countdown is the
 * reason this row is near the top.
 */
export function MemberRow({
  member,
  onPress,
}: {
  member: LoyaltyMember;
  onPress: (member: LoyaltyMember) => void;
}) {
  const status = describeMemberStatus(member.status);
  const tone = TONE_COLORS[status.tone];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(member)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${displayName(member)}, ${status.label}, ${describeNextCard(member.headline)}`}
    >
      <View style={styles.header}>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName(member)}
          </Text>
          {member.phone && member.name ? (
            <Text style={styles.phone} numberOfLines={1}>
              {member.phone}
            </Text>
          ) : null}
        </View>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeLabel, { color: tone.text }]}>{status.label}</Text>
        </View>
      </View>

      {member.rewardsAvailable > 0 ? <Text style={styles.ready}>{member.rewardsAvailable} reward{member.rewardsAvailable === 1 ? "" : "s"} ready</Text> : null}
      <MemberProgressBar progress={member.headline} />

      <View style={styles.footer}>
        <Text style={styles.counter}>{describeBalance(member.headline)}</Text>
        <Text style={styles.remaining} numberOfLines={1}>
          {describeNextCard(member.headline)}
        </Text>
      </View>

      {/* Dormancy rides ALONGSIDE the status so "one stamp away" and "has not
          been in for months" can both be true — that pair is the best call a
          merchant can make all day. */}
      {member.isDormant && member.status !== "dormant" ? (
        <Text style={styles.quiet}>Has not been in for a while</Text>
      ) : null}

      {member.programs.length > 1 ? (
        <Text style={styles.extra}>
          +{member.programs.length - 1} other card{member.programs.length === 2 ? "" : "s"}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  identity: { flex: 1, gap: 2 },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  phone: { ...typography.caption, color: colors.textSecondary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  badgeLabel: { fontSize: 12, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  counter: { ...typography.caption, fontWeight: "800", color: colors.textPrimary },
  ready: { ...typography.caption, color: colors.success, fontWeight: "700" },
  remaining: { ...typography.caption, color: colors.textSecondary, flexShrink: 1, textAlign: "right" },
  quiet: { ...typography.small, color: "#92400E", fontWeight: "600" },
  extra: { ...typography.small, color: colors.textSecondary },
});
