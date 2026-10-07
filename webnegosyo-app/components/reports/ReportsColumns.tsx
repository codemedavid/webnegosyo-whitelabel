import React from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";

import { spacing } from "../../theme/colors";

/** From here a single column wastes the screen: iPads and wide phones in landscape. */
const WIDE_MIN_WIDTH = 900;

export function useIsWideReports(): boolean {
  return useWindowDimensions().width >= WIDE_MIN_WIDTH;
}

interface ReportsColumnsProps {
  isWide: boolean;
  /** The answer and what to do about it: read first, so it takes the wider left column. */
  main: React.ReactNode;
  /** Context and detail. Stacked under `main` on a phone. */
  side: React.ReactNode;
}

/**
 * One column on a phone, two on a tablet. Stretching a phone layout across an
 * iPad turns every card into a long empty strip, and the eye has to travel the
 * full width of the screen to read a number and its label.
 */
export function ReportsColumns({ isWide, main, side }: ReportsColumnsProps) {
  if (!isWide) {
    return (
      <View>
        {main}
        {side}
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <View style={styles.main}>{main}</View>
      <View style={styles.side}>{side}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xl },
  main: { flex: 3 },
  side: { flex: 2 },
});
