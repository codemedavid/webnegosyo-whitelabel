import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Tone } from "../../lib/superadmin-ui";
import { radius, spacing, typography } from "../../theme/colors";

interface PillProps {
  label: string;
  tone: Tone;
}

/** Small status badge. Colour comes from the shared tone map, never inline. */
export function Pill({ label, tone }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  text: { ...typography.small, fontWeight: "800", letterSpacing: 0.3 },
});
