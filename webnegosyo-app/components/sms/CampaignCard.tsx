import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "../Icon";
import { describeCampaignTiming } from "../../lib/sms/campaign-summary";
import { statusLabel } from "../../lib/sms/campaign-status";
import type { CampaignDueState } from "../../lib/sms/due-runs";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * A campaign in the list.
 *
 * Cards are right here and wrong for guests: there are a handful of campaigns,
 * each is a distinct object the merchant opens and acts on, and one of them is
 * usually the reason they came to this tab. A due campaign says so in the
 * strongest thing on the card, because a campaign that came due and was never
 * sent is the exact failure this feature keeps having.
 */

export function CampaignCard({
  state,
  onPress,
}: {
  state: CampaignDueState;
  onPress: () => void;
}) {
  const timing = describeCampaignTiming(state);

  return (
    <TouchableOpacity
      style={[styles.card, timing.isUrgent && styles.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${state.name}. ${timing.line}.`}
    >
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {state.name}
        </Text>
        {/*
          The badge earns its ink only when it is telling the merchant
          something they must act on. Everywhere else the timing line below
          already carries the status in words, and a second copy in a pill is
          just a louder repeat.
        */}
        {timing.isUrgent ? (
          <View style={styles.dueBadge}>
            <Text style={styles.dueBadgeText}>DUE</Text>
          </View>
        ) : (
          <Text style={styles.status}>{statusLabel(state.status)}</Text>
        )}
      </View>

      <View style={styles.foot}>
        <Text style={[styles.timing, timing.isUrgent && styles.timingUrgent]}>
          {timing.line}
        </Text>
        <Icon name="chevron" color={colors.textTertiary} size={14} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
  },
  // A whole-border weight change, not a coloured rail down one edge: the card
  // is either asking for the merchant or it is not.
  cardUrgent: { borderColor: colors.success, borderWidth: 1.5 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  status: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
  dueBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  dueBadgeText: {
    ...typography.small,
    color: colors.textOnDark,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timing: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  timingUrgent: { color: colors.success, fontWeight: "700" },
});
