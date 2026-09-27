import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  describeBalance,
  type LoyaltyMemberProgress,
} from "../../lib/loyalty/members";

/**
 * How far along one card is.
 *
 * The bar is drawn only when progress is KNOWN. A programme whose rules cannot
 * be read has an unknown threshold, and a bar at 0% there would tell the
 * merchant the customer has nothing when the truth is that we cannot say.
 */
export function describeNextCard(progress: LoyaltyMemberProgress | null): string {
  if (!progress) return "No card yet";
  if (progress.threshold <= 0) return "Next reward: progress unavailable";
  const remaining = Math.max(0, progress.threshold - progress.balance);
  const unit = progress.earnMode === "points" ? "point" : "visit";
  return remaining === 0 ? "Next card complete" : `Next reward: ${remaining} more ${unit}${remaining === 1 ? "" : "s"}`;
}

export function MemberProgressBar({ progress }: { progress: LoyaltyMemberProgress | null }) {
  if (!progress || progress.threshold <= 0) {
    return <View style={styles.trackUnknown} accessibilityLabel="Progress unavailable" />;
  }

  const percent = Math.max(0, Math.min(100, progress.balance / progress.threshold * 100));
  return (
    <View
      style={styles.track}
      accessible
      accessibilityLabel="Next card progress"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View
        style={[
          styles.fill,
          { width: `${percent}%` },
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

      {isReady ? <Text style={styles.remainingReady}>{progress.rewardsAvailable} reward{progress.rewardsAvailable === 1 ? "" : "s"} ready</Text> : null}
      <MemberProgressBar progress={progress} />

      <View style={styles.cardFooter}>
        <Text style={styles.remaining}>
          {describeNextCard(progress)}
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
