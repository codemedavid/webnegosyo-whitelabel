import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";

/** How long "Nothing to pay this time · Undo" stays (the expense Undo bar's window). */
export const BILL_NOTICE_MS = 6_000;

interface BillNoticeProps {
  message: string;
  /** Shows "Undo" when given. */
  onUndo?: () => void;
  onDismiss: () => void;
}

/**
 * The ink bar after a bill write: what happened in words, and Undo for a skip.
 * It goes away on its own; a new notice replaces it (the screen keys it).
 */
export function BillNotice({ message, onUndo, onDismiss }: BillNoticeProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, BILL_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
        {onUndo ? (
          <TouchableOpacity onPress={onUndo} hitSlop={8} accessibilityRole="button" accessibilityLabel="Undo" testID="bill-notice-undo">
            <Text style={styles.undo}>Undo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.heroInk,
    ...shadow.md,
  },
  text: { ...typography.caption, fontWeight: "600", color: colors.heroInkText, flex: 1 },
  undo: { ...typography.body, fontWeight: "800", color: colors.heroInkPositive },
});
