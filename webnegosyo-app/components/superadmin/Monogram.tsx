import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { monogram, monogramColor } from "../../lib/superadmin-ui";
import { radius, typography } from "../../theme/colors";

interface MonogramProps {
  name: string;
  /** Stable identity for the colour. Defaults to the name. */
  seed?: string;
  size?: number;
}

/**
 * Coloured initials badge standing in for a restaurant logo.
 *
 * The colour is derived from a stable seed rather than list position, so a
 * store keeps its identity while filters reorder the list around it.
 */
export function Monogram({ name, seed, size = 44 }: MonogramProps) {
  const backgroundColor = monogramColor(seed ?? name);

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 3.2, backgroundColor },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>
        {monogram(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  text: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: typography.eyebrow.letterSpacing,
  },
});
