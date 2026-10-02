import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { LoyaltyEarnMode, RewardStep } from "../../lib/loyalty/programs";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { RewardIcon } from "./RewardIcon";

/**
 * The reward card drawn the way a regular sees it: numbered slots, each reward
 * sitting on the stamp that unlocks it, the big one on the last slot.
 *
 * One component for the wizard (tap a slot to put a reward there), the review
 * step and the program list, so what the merchant designs is what they manage.
 */

const SLOTS_PER_ROW = 5;
const SLOT = 46;
const STAGGER_MS = 35;
const GOLD = colors.tabBarActive;

interface RewardCardPreviewProps {
  name: string;
  earnMode: LoyaltyEarnMode;
  threshold: number;
  steps: RewardStep[];
  /** Stamps to show as already collected — makes a preview feel alive. */
  filled?: number;
  /** When set, slots are buttons: tap one to place or edit its reward. */
  onSlotPress?: (at: number) => void;
  /** The slot being edited, ringed. */
  selectedAt?: number | null;
  /** Hides the reward list under the card. */
  isCompact?: boolean;
  footer?: React.ReactNode;
}

export function RewardCardPreview({
  name,
  earnMode,
  threshold,
  steps,
  filled = 0,
  onSlotPress,
  selectedAt = null,
  isCompact = false,
  footer,
}: RewardCardPreviewProps) {
  const isStampGrid = earnMode === "stamp" && threshold > 0 && threshold <= 20;
  const unit = earnMode === "stamp" ? "stamp" : "point";

  return (
    <View style={styles.card} accessibilityLabel={`${name || "Reward card"}: ${steps.map(step => `${step.label} at ${step.at} ${unit}s`).join(", ")}`}>
      <View style={styles.shine} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{earnMode === "stamp" ? "Stamp card" : "Points card"}</Text>
          <Text style={styles.title} numberOfLines={1}>{name || "Your reward card"}</Text>
        </View>
        <Text style={styles.headerEmoji}>{steps[steps.length - 1]?.emoji ?? "🎁"}</Text>
      </View>

      {isStampGrid ? (
        <StampGrid threshold={threshold} steps={steps} filled={filled} onSlotPress={onSlotPress} selectedAt={selectedAt} />
      ) : (
        <PointsBar threshold={threshold} steps={steps} filled={filled} onSlotPress={onSlotPress} selectedAt={selectedAt} />
      )}

      {!isCompact ? (
        <View style={styles.ladder}>
          {steps.map(step => (
            <View key={step.at} style={styles.ladderRow}>
              <RewardIcon emoji={step.emoji} imageUrl={step.imageUrl} size={30} ringColor={step.isFinal ? GOLD : "transparent"} />
              <Text style={styles.ladderLabel} numberOfLines={1}>{step.label}</Text>
              <Text style={styles.ladderAt}>{step.at} {unit}{step.at === 1 ? "" : "s"}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {footer}
    </View>
  );
}

interface GridProps {
  threshold: number;
  steps: RewardStep[];
  filled: number;
  onSlotPress?: (at: number) => void;
  selectedAt: number | null;
}

function StampGrid({ threshold, steps, filled, onSlotPress, selectedAt }: GridProps) {
  const byAt = new Map(steps.map(step => [step.at, step]));
  return (
    <View style={styles.grid}>
      {Array.from({ length: threshold }, (_, index) => {
        const at = index + 1;
        const step = byAt.get(at) ?? null;
        return (
          <PopIn key={at} delay={index * STAGGER_MS}>
            <Slot at={at} step={step} isFilled={at <= filled} isSelected={selectedAt === at} onPress={onSlotPress} />
          </PopIn>
        );
      })}
    </View>
  );
}

interface SlotProps {
  at: number;
  step: RewardStep | null;
  isFilled: boolean;
  isSelected: boolean;
  onPress?: (at: number) => void;
}

function Slot({ at, step, isFilled, isSelected, onPress }: SlotProps) {
  const ring = isSelected ? colors.accent : step ? GOLD : isFilled ? GOLD : colors.heroInkMuted;
  const face = step ? (
    <View>
      <RewardIcon emoji={step.emoji} imageUrl={step.imageUrl} size={SLOT} ringColor={ring} backgroundColor={step.isFinal ? "#FFF6DC" : "#FFFFFF"} />
      <View style={[styles.badge, step.isFinal && styles.badgeFinal]}>
        <Text style={styles.badgeText}>{at}</Text>
      </View>
    </View>
  ) : (
    <View style={[styles.slot, { borderColor: ring }, isFilled && styles.slotFilled, isSelected && styles.slotSelected]}>
      <Text style={[styles.slotText, isFilled && styles.slotTextFilled]}>{isFilled ? "✓" : onPress ? "+" : at}</Text>
    </View>
  );
  if (!onPress) return face;
  return (
    <TouchableOpacity
      onPress={() => onPress(at)}
      accessibilityRole="button"
      accessibilityLabel={step ? `Stamp ${at}: ${step.label}. Tap to change` : `Stamp ${at}: add a reward here`}
      hitSlop={4}
    >
      {face}
    </TouchableOpacity>
  );
}

function PointsBar({ threshold, steps, filled, onSlotPress, selectedAt }: GridProps) {
  const percent = threshold > 0 ? Math.max(0, Math.min(1, filled / threshold)) : 0;
  return (
    <View style={styles.pointsWrap}>
      <View style={styles.markers}>
        {steps.map(step => {
          const left = `${Math.max(0, Math.min(100, (step.at / threshold) * 100))}%` as const;
          const icon = (
            <RewardIcon emoji={step.emoji} imageUrl={step.imageUrl} size={34} ringColor={selectedAt === step.at ? colors.accent : GOLD} />
          );
          return (
            <View key={step.at} style={[styles.marker, { left }]}>
              {onSlotPress ? (
                <TouchableOpacity onPress={() => onSlotPress(step.at)} accessibilityRole="button" accessibilityLabel={`${step.label} at ${step.at} points. Tap to change`}>
                  {icon}
                </TouchableOpacity>
              ) : icon}
            </View>
          );
        })}
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${percent * 100}%` }]} />
      </View>
      <View style={styles.trackScale}>
        <Text style={styles.trackLabel}>0</Text>
        <Text style={styles.trackLabel}>{threshold} pts</Text>
      </View>
    </View>
  );
}

/** Each slot springs in after the one before it — the card "prints" itself. */
function PopIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.spring(scale, { toValue: 1, delay, friction: 5, tension: 140, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [scale, delay]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroInk,
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.heroInkElevated,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: GOLD },
  title: { ...typography.title, fontSize: 22, color: colors.heroInkText },
  headerEmoji: { fontSize: 34 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: SLOTS_PER_ROW * SLOT + (SLOTS_PER_ROW - 1) * 10,
    alignSelf: "center",
  },
  slot: {
    width: SLOT,
    height: SLOT,
    borderRadius: SLOT / 2,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  slotFilled: { backgroundColor: GOLD, borderStyle: "solid" },
  slotSelected: { borderStyle: "solid", backgroundColor: colors.heroInkElevated },
  slotText: { ...typography.caption, fontWeight: "700", color: colors.heroInkMuted },
  slotTextFilled: { color: colors.heroInk, fontSize: 18 },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.heroInkElevated,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeFinal: { backgroundColor: colors.accent, borderColor: colors.accent },
  badgeText: { ...typography.small, fontWeight: "800", color: colors.heroInkText },
  ladder: {
    backgroundColor: colors.heroInkElevated,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  ladderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ladderLabel: { ...typography.body, fontWeight: "600", color: colors.heroInkText, flex: 1 },
  ladderAt: { ...typography.caption, color: colors.heroInkMuted },
  pointsWrap: { paddingTop: 40, paddingHorizontal: spacing.sm },
  markers: { position: "absolute", top: 0, left: spacing.sm, right: spacing.sm, height: 38 },
  marker: { position: "absolute", top: 0, marginLeft: -17 },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.heroInkElevated, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: GOLD, borderRadius: 6 },
  trackScale: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  trackLabel: { ...typography.small, color: colors.heroInkMuted },
});
