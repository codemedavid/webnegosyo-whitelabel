import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { colors, typography, spacing } from "../theme/colors";
import { formatCount } from "../lib/format";

/**
 * When the store is busy, across the whole period.
 *
 * The one chart on the screen that is not per-branch, and the only one that
 * answers a scheduling question: an owner reads the peak to know where to put
 * staff, and the dead hours to know which slot a promo could fill. Hours with no
 * trade at all are dropped from the strip entirely — a restaurant shut at 4am
 * does not need eight empty bars saying so.
 */

interface HourVolumeChartProps {
  /** 24 order counts, one per Manila hour, index 0 = midnight. */
  hours: readonly number[];
}

/** Hours below this share of the peak are labelled as the quiet stretch. */
const QUIET_RATIO = 0.15;

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

export function HourVolumeChart({ hours }: HourVolumeChartProps) {
  const peak = Math.max(...hours, 0);
  if (peak === 0) return null;

  const traded = hours
    .map((count, hour) => ({ hour, count }))
    .filter((entry) => entry.count > 0);

  const first = traded[0].hour;
  const last = traded[traded.length - 1].hour;
  const peakHour = traded.reduce((best, entry) => (entry.count > best.count ? entry : best));

  const window = hours
    .map((count, hour) => ({ hour, count }))
    .filter((entry) => entry.hour >= first && entry.hour <= last);

  const quiet = window.filter((entry) => entry.count / peak < QUIET_RATIO);

  return (
    <View>
      <View style={styles.bars}>
        {window.map(({ hour, count }) => {
          const ratio = count / peak;
          const isPeak = hour === peakHour.hour;
          return (
            <View key={hour} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(ratio * 72, count > 0 ? 4 : 2),
                    backgroundColor: isPeak
                      ? colors.accent
                      : count > 0
                        ? colors.primaryLight
                        : colors.separator,
                  },
                ]}
              />
              {/* Only the ends and the peak are labelled: 14 labels at 9px is
                  noise, and the shape is what carries the meaning. */}
              <Text style={styles.hourLabel}>
                {hour === first || hour === last || isPeak ? formatHour(hour) : ""}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.caption}>
        Busiest at {formatHour(peakHour.hour)} ({formatCount(peakHour.count)} orders).
        {quiet.length > 0
          ? ` Quietest stretch: ${formatHour(quiet[0].hour)}–${formatHour(quiet[quiet.length - 1].hour)}.`
          : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 92 },
  column: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 2 },
  hourLabel: { fontSize: 9, color: colors.textTertiary, marginTop: 4, height: 12 },
  caption: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
});
