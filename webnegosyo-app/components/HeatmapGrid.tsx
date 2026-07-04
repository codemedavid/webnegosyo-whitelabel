import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../theme/colors";

interface HeatmapGridProps {
  heatmap: { day: number; hour: number; count: number }[];
  peakHour: { day: number; hour: number; count: number };
  quietHour: { day: number; hour: number; count: number };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Show 5 time slots (4-hour blocks) to keep it compact
const HOUR_SLOTS = [
  { label: "6am", start: 6, end: 9 },
  { label: "10am", start: 10, end: 13 },
  { label: "2pm", start: 14, end: 17 },
  { label: "6pm", start: 18, end: 21 },
  { label: "10pm", start: 22, end: 1 },
];

// Warm editorial intensity ramp: quiet cells stay on the subtle surface,
// then amber → coral → charcoal as order volume climbs.
const HEATMAP_SCALE: { threshold: number; color: string }[] = [
  { threshold: 0.25, color: colors.warningLight },
  { threshold: 0.5, color: colors.warning },
  { threshold: 0.75, color: colors.accent },
  { threshold: 1, color: colors.primary },
];

const LIGHT_TEXT_INTENSITY = 0.5;

function heatmapCellColor(intensity: number): string {
  if (intensity === 0) return colors.surfaceSubtle;
  const match = HEATMAP_SCALE.find((step) => intensity <= step.threshold);
  return match?.color ?? colors.primary;
}

export function HeatmapGrid({ heatmap, peakHour, quietHour: _quietHour }: HeatmapGridProps) {
  // Aggregate into 4-hour slots per day
  const slotData: { day: number; slotIndex: number; count: number }[] = [];

  for (let day = 0; day < 7; day++) {
    for (let si = 0; si < HOUR_SLOTS.length; si++) {
      const slot = HOUR_SLOTS[si];
      let count = 0;
      for (let h = slot.start; h <= slot.end; h++) {
        const hourNorm = h % 24;
        const cell = heatmap.find((c) => c.day === day && c.hour === hourNorm);
        count += cell?.count ?? 0;
      }
      slotData.push({ day, slotIndex: si, count });
    }
  }

  const slotMax = Math.max(...slotData.map((s) => s.count), 1);

  return (
    <View>
      {/* Header row */}
      <View style={styles.row}>
        <View style={styles.labelCell} />
        {DAY_LABELS.map((d) => (
          <View key={d} style={styles.headerCell}>
            <Text style={styles.headerText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Data rows */}
      {HOUR_SLOTS.map((slot, si) => (
        <View key={slot.label} style={styles.row}>
          <View style={styles.labelCell}>
            <Text style={styles.labelText}>{slot.label}</Text>
          </View>
          {DAY_LABELS.map((_, day) => {
            const cell = slotData.find((s) => s.day === day && s.slotIndex === si);
            const count = cell?.count ?? 0;
            const intensity = slotMax > 0 ? count / slotMax : 0;
            return (
              <View
                key={`${day}-${si}`}
                style={[styles.cell, { backgroundColor: heatmapCellColor(intensity) }]}
              >
                {count > 0 && (
                  <Text style={[styles.cellText, intensity > LIGHT_TEXT_INTENSITY && styles.cellTextLight]}>
                    {count}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Peak annotation */}
      <View style={styles.annotationRow}>
        <Text style={styles.annotationText}>
          Peak: {DAY_LABELS[peakHour.day]} {formatHour(peakHour.hour)} ({peakHour.count} orders)
        </Text>
      </View>
    </View>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 2, marginBottom: 2 },
  labelCell: { width: 36, justifyContent: "center" },
  labelText: { ...typography.small, color: colors.textTertiary },
  headerCell: { flex: 1, alignItems: "center", paddingBottom: spacing.xs },
  headerText: { ...typography.small, color: colors.textTertiary, fontWeight: "500" },
  cell: {
    flex: 1,
    aspectRatio: 1.4,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 8, fontWeight: "600", color: colors.textPrimary },
  cellTextLight: { color: colors.textOnDark },
  annotationRow: { marginTop: spacing.sm, alignItems: "center" },
  annotationText: { ...typography.caption, color: colors.textSecondary, fontWeight: "500" },
});
