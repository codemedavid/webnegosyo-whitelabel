import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

/**
 * One-of-N chooser where every option is visible at once.
 *
 * Distinct from `OptionPills` on purpose: a pill row that scrolls says "here
 * are some tags", a segmented track says "pick exactly one of these four".
 * Used for the choices a merchant changes constantly mid-service — the view
 * mode and the period — so they never scroll or open anything to reach them.
 */
interface SegmentedControlProps<T> {
  options: readonly { label: string; value: T }[];
  /**
   * `null` leaves every segment unselected — the honest state when a narrower
   * choice elsewhere (a single picked day) has overridden this control.
   */
  value: T | null;
  onChange: (value: T) => void;
  /** Prefix for the accessibility label, e.g. "Show". */
  accessibilityPrefix: string;
}

export function SegmentedControl<T>({
  options,
  value,
  onChange,
  accessibilityPrefix,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <TouchableOpacity
            key={option.label}
            style={[styles.segment, isActive && styles.segmentActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${accessibilityPrefix} ${option.label}`}
          >
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const TRACK_PADDING = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: TRACK_PADDING,
    gap: TRACK_PADDING,
  },
  segment: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - TRACK_PADDING,
    paddingHorizontal: spacing.xs,
  },
  segmentActive: { backgroundColor: colors.primary },
  // Unselected text stays at full ink rather than a grey: this control sits on
  // the cream canvas in daylight, and a muted label here measured 3.6:1.
  label: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  labelActive: { color: colors.textOnDark, fontWeight: "700" },
});
