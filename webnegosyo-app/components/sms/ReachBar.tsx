import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { buildReachSegments, reachHeadline } from "../../lib/sms/reach-bar";
import type { CustomerListFilter, CustomerListStats, ReachabilityStatus } from "../../lib/sms/customer-list";
import { colors, radius, spacing, typography } from "../../theme/colors";

/**
 * How much of the guest list this merchant can actually text.
 *
 * This replaces four stat tiles sitting in a row. Four counts are four facts;
 * the merchant needed the one underneath them — the SHARE that is reachable —
 * and a way to act on the rest. So the readout and the control are the same
 * object: every band is a filter, and tapping "Not opted in" puts the list
 * into exactly the working set where the consent button does its job.
 *
 * The reveal on first load is the screen's only animation. It is not
 * decoration: the bar is the answer to the question the merchant opened this
 * tab with, and drawing it in is what stops the eye going to the search box.
 */

/**
 * Tones per band, and the one judgement in this file: **"Opted out" is not an
 * error.** The old screen painted it in danger red, which frames a guest's own
 * decision as a fault to be corrected. It is settled, so it is neutral. Amber
 * goes to "Not opted in", the only band the merchant can actually move.
 */
const TONES: Record<ReachabilityStatus, string> = {
  textable: colors.success,
  no_consent: colors.warning,
  opted_out: colors.textSecondary,
  suppressed: colors.danger,
  no_phone: colors.textTertiary,
};

const REVEAL_MS = 420;

interface ReachBarProps {
  stats: CustomerListStats;
  filter: CustomerListFilter;
  onFilter: (filter: CustomerListFilter) => void;
}

export function ReachBar({ stats, filter, onFilter }: ReachBarProps) {
  const segments = buildReachSegments(stats);
  const headline = reachHeadline(stats);
  const reveal = useRevealProgress(segments.length > 0);

  return (
    <View style={styles.card}>
      <View style={styles.headline}>
        <Text style={styles.value}>{headline.value}</Text>
        <Text style={styles.sentence}>{headline.sentence}</Text>
      </View>

      {segments.length > 0 && (
        <>
          <View
            style={styles.track}
            accessibilityRole="image"
            accessibilityLabel={`${headline.value} ${headline.sentence}`}
          >
            <Animated.View style={[styles.trackFill, { width: reveal }]}>
              {segments.map((segment) => (
                <View
                  key={segment.status}
                  style={{
                    flex: segment.share,
                    backgroundColor: TONES[segment.status],
                  }}
                />
              ))}
            </Animated.View>
          </View>

          <View style={styles.legend}>
            {segments.map((segment) => (
              <LegendEntry
                key={segment.status}
                label={segment.label}
                count={segment.count}
                tone={TONES[segment.status]}
                isActive={segment.filter !== null && segment.filter === filter}
                onPress={segment.filter ? () => onFilter(segment.filter!) : undefined}
              />
            ))}
          </View>
        </>
      )}

      {/*
        Only offered once a band is on: a permanent "Show all" next to an
        unfiltered list is a control that does nothing, which teaches the
        merchant that controls here might do nothing.
      */}
      {filter !== "all" && (
        <TouchableOpacity
          onPress={() => onFilter("all")}
          accessibilityRole="button"
          style={styles.clear}
        >
          <Text style={styles.clearText}>Show everyone</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function LegendEntry({
  label,
  count,
  tone,
  isActive,
  onPress,
}: {
  label: string;
  count: number;
  tone: string;
  isActive: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.entry, isActive && styles.entryActive]}
      onPress={onPress}
      // A band with no filter behind it stays visible and inert rather than
      // vanishing: the count still belongs in the total the merchant is reading.
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${count} ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={styles.entryCount}>{count}</Text>
      <Text style={styles.entryLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * The bar's width, revealed once.
 *
 * Once, not on every reload: this tab reloads on focus, and a bar that redraws
 * itself each time the merchant comes back from the campaign editor is a tic.
 * Reduced motion skips straight to full width — the information is the width,
 * never the movement.
 */
function useRevealProgress(hasData: boolean): Animated.AnimatedInterpolation<string> {
  const progress = useRef(new Animated.Value(0)).current;
  const hasRevealed = useRef(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setPrefersReducedMotion(enabled);
      })
      // Absent on some embedded webviews and older builds; a rejected promise
      // must not leave the bar at zero width forever.
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasData || hasRevealed.current) return;
    hasRevealed.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: prefersReducedMotion ? 0 : REVEAL_MS,
      // Width cannot be driven natively; the bar is one small view and this
      // runs once, so the JS driver is the right trade here.
      useNativeDriver: false,
    }).start();
  }, [hasData, prefersReducedMotion, progress]);

  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
}

const BAR_HEIGHT = 10;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headline: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  // The one large figure on the screen. Everything else is 11–17px, so this
  // carries the hierarchy on its own without a label above it.
  value: { fontSize: 34, fontWeight: "800", color: colors.textPrimary, letterSpacing: -1 },
  sentence: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  track: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: colors.primaryLight,
    overflow: "hidden",
  },
  trackFill: { flexDirection: "row", height: BAR_HEIGHT },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    // Two per row on a 390px screen, three on a wider one, without a
    // breakpoint: the entries are sized by their own content.
    flexGrow: 1,
    flexBasis: 128,
  },
  entryActive: { backgroundColor: colors.primaryLight },
  dot: { width: 8, height: 8, borderRadius: 4 },
  entryCount: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  // Full ink rather than a grey: this card is read on cream, in daylight,
  // often outdoors. A muted label here measured 3.6:1.
  entryLabel: { ...typography.caption, color: colors.textPrimary, flexShrink: 1 },
  clear: { alignSelf: "flex-start" },
  clearText: { ...typography.caption, color: colors.accent, fontWeight: "700" },
});
