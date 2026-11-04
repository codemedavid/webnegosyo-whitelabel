import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { barLabel, overShortBars, overShortSentence, overShortSummary, type BarDirection, type OverShortShift } from "./over-short";

interface OverShortStripProps {
  staffName: string;
  /** Oldest first; usually the last 14 shifts. */
  shifts: readonly OverShortShift[];
  /** Height of each half (over above the line, short below). */
  halfHeight?: number;
}

const BAR_COLOR: Record<BarDirection, string> = {
  short: colors.danger,
  over: colors.warning,
  exact: colors.success,
  none: colors.separator,
};

/** An exact shift still shows a sliver on the line, so "matched" is visible, not empty. */
const EXACT_SLIVER = 2;

/**
 * A diverging bar per shift around a zero line — over above, short below —
 * then the pattern in words ("Ana was short 2 times in the last 14 shifts ·
 * −₱260 in all"). The colours are a cue; the sentence and each bar's label
 * carry the meaning. Plain Views: no chart library ships in the app.
 */
export function OverShortStrip({ staffName, shifts, halfHeight = 28 }: OverShortStripProps) {
  const bars = overShortBars(shifts);
  const sentence = overShortSentence(staffName, overShortSummary(shifts));
  return (
    <View style={styles.wrap} testID="over-short-strip">
      <View style={[styles.strip, { height: halfHeight * 2 }]} accessibilityLabel={sentence}>
        <View style={[styles.zero, { top: halfHeight }]} />
        {bars.map((bar) => {
          const length = bar.direction === "exact" ? EXACT_SLIVER : Math.max(bar.ratio > 0 ? 3 : 0, Math.round(bar.ratio * halfHeight));
          const isOver = bar.direction === "over";
          return (
            <View key={bar.id} style={styles.slot} accessible accessibilityLabel={barLabel(bar)} testID={`over-short-bar-${bar.id}`}>
              <View
                style={[
                  styles.bar,
                  { height: length, backgroundColor: BAR_COLOR[bar.direction] },
                  isOver ? { bottom: halfHeight } : { top: bar.direction === "exact" ? halfHeight - EXACT_SLIVER / 2 : halfHeight },
                  bar.direction === "none" && styles.uncounted,
                ]}
              />
            </View>
          );
        })}
      </View>
      <Text style={styles.sentence}>{sentence}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  strip: { flexDirection: "row", gap: 3, position: "relative" },
  zero: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.textTertiary },
  slot: { flex: 1, position: "relative" },
  bar: { position: "absolute", left: 0, right: 0, borderRadius: radius.sm / 2 },
  uncounted: { height: 0 },
  sentence: { ...typography.caption, color: colors.textMuted },
});
