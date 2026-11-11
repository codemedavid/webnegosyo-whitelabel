import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../theme/colors";

const DEFAULT_DURATION_MS = 4000;
const TICK_MS = 1000;

interface UndoBarProps {
  /** "Approving ₱185 for Ana…" */
  message: string;
  onUndo: () => void;
  /** Runs once the countdown ends without an Undo. */
  onCommit: () => void;
  durationMs?: number;
  actionLabel?: string;
  /** A coral "do this" button before Undo ("Repeat"). It never settles the countdown. */
  secondaryAction?: { label: string; onPress: () => void } | null;
}

/**
 * A short countdown with Undo before something is sent (design-spec P5:
 * prefer undo to warnings). Used for an Approve tapped on a push: the
 * decision is only posted once the seconds run out. One at a time; the
 * caller decides where it docks.
 */
export function UndoBar({
  message,
  onUndo,
  onCommit,
  durationMs = DEFAULT_DURATION_MS,
  actionLabel = "Undo",
  secondaryAction = null,
}: UndoBarProps) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationMs / TICK_MS));
  const isSettled = useRef(false);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), TICK_MS);
    const done = setTimeout(() => {
      if (isSettled.current) return;
      isSettled.current = true;
      commit.current();
    }, durationMs);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [durationMs]);

  const undo = () => {
    if (isSettled.current) return;
    isSettled.current = true;
    onUndo();
  };

  return (
    <View style={styles.bar}>
      <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.ringText}>{secondsLeft}</Text>
      </View>
      <Text style={styles.message} numberOfLines={secondaryAction ? 3 : 2} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {message}
      </Text>
      {secondaryAction ? (
        <TouchableOpacity
          onPress={secondaryAction.onPress}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryAction.label}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.secondaryText}>{secondaryAction.label}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={undo}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.actionText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.heroInk,
    ...shadow.md,
  },
  ring: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.tabBarActive,
    alignItems: "center",
    justifyContent: "center",
  },
  ringText: { ...typography.caption, fontWeight: "800", color: colors.heroInkText },
  message: { ...typography.body, fontWeight: "600", color: colors.heroInkText, flex: 1 },
  action: { minHeight: 48, minWidth: 64, alignItems: "center", justifyContent: "center" },
  secondary: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { ...typography.caption, fontWeight: "800", color: colors.textOnDark },
  actionText: { ...typography.body, fontWeight: "800", color: colors.tabBarActive },
});
