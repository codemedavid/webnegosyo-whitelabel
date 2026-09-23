import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  describeBalance,
  describeRemaining,
  type LoyaltyMemberProgress,
} from "../../lib/loyalty/members";

/**
 * How far along one card is.
 *
 * The bar is drawn only when progress is KNOWN. A programme whose rules cannot
 * be read has an unknown threshold, and a bar at 0% there would tell the
 * merchant the customer has nothing when the truth is that we cannot say.
 */
export function MemberProgressBar({ progress }: { progress: LoyaltyMemberProgress | null }) {
  if (!progress || progress.percent === null) {
    return <View style={styles.trackUnknown} accessibilityLabel="Progress unavailable" />;
  }

  const isReady = progress.rewardsAvailable > 0 || progress.remaining === 0;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
    >
      <View
        style={[
          styles.fill,
          { width: `${Math.max(progress.percent, 2)}%` },
          isReady && styles.fillReady,
        ]}
      />
    </View>
  );
}

/** The whole card in three lines: programme, counter, and what is left. */
export function MemberProgressCard({
  progress,
  showProgramName = true,
}: {
  progress: LoyaltyMemberProgress;
  showProgramName?: boolean;
}) {
  const isReady = progress.rewardsAvailable > 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {showProgramName ? (
          <Text style={styles.programName} numberOfLines={1}>
            {progress.programName}
          </Text>
        ) : null}
        <Text style={styles.counter}>{describeBalance(progress)}</Text>
      </View>

      <MemberProgressBar progress={progress} />

      <View style={styles.cardFooter}>
        <Text style={[styles.remaining, isReady && styles.remainingReady]}>
          {describeRemaining(progress)}
        </Text>
        <Text style={styles.reward} numberOfLines={1}>
          {progress.rewardLabel}
        </Text>
      </View>

      {progress.programStatus !== "active" ? (
        <Text style={styles.note}>
          This programme is {progress.programStatus} — these stamps are not growing.
        </Text>
      ) : null}
    </View>
  );
}

const BAR_HEIGHT = 8;

const styles = StyleSheet.create({
  track: {
    height: BAR_HEIGHT,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  trackUnknown: {
    height: BAR_HEIGHT,
    backgroundColor: colors.separator,
    borderRadius: radius.full,
    opacity: 0.5,
  },
  fill: { height: BAR_HEIGHT, backgroundColor: colors.accent, borderRadius: radius.full },
  fillReady: { backgroundColor: colors.success },

  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  programName: { ...typography.body, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  counter: { ...typography.body, fontWeight: "800", color: colors.textPrimary },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  remaining: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
  remainingReady: { color: colors.success, fontWeight: "700" },
  reward: { ...typography.caption, color: colors.textSecondary, flexShrink: 1, textAlign: "right" },
  note: { ...typography.small, color: colors.warning, fontWeight: "600" },
});
