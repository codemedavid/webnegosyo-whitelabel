import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";

interface SwipeToCompleteProps {
  label: string;
  /** Why the gesture is locked. Shown instead of the label when disabled. */
  blockedReason?: string;
  disabled: boolean;
  onComplete: () => void;
}

const THUMB = 56;
/** Fraction of the track that must be crossed to count as a deliberate swipe. */
const COMMIT_RATIO = 0.75;

/**
 * Deliberate confirmation gesture for completing a sale.
 *
 * A swipe rather than a tap because completing takes the customer's money and
 * fires a receipt — a mis-tap at a busy counter is expensive. When `disabled`
 * (e.g. no payment proof captured yet) the thumb does not move at all.
 */
export function SwipeToComplete({
  label,
  blockedReason,
  disabled,
  onComplete,
}: SwipeToCompleteProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  // Mirrors the animated value for the responder callbacks, which cannot read it.
  const offset = useRef(0);
  const maxSlide = Math.max(0, trackWidth - THUMB - spacing.sm);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_, gesture) => {
          if (disabled) return;
          const next = Math.min(Math.max(0, gesture.dx), maxSlide);
          offset.current = next;
          translateX.setValue(next);
        },
        onPanResponderRelease: () => {
          if (disabled) return;
          if (maxSlide > 0 && offset.current >= maxSlide * COMMIT_RATIO) {
            Animated.timing(translateX, {
              toValue: maxSlide,
              duration: 120,
              useNativeDriver: true,
            }).start(() => {
              offset.current = 0;
              translateX.setValue(0);
              onComplete();
            });
            return;
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => {
            offset.current = 0;
          });
        },
      }),
    [disabled, maxSlide, onComplete, translateX],
  );

  const onLayout = (event: LayoutChangeEvent) =>
    setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityLabel={disabled ? blockedReason ?? label : label}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]} numberOfLines={2}>
        {disabled && blockedReason ? blockedReason : label}
      </Text>
      <Animated.View
        style={[styles.thumb, disabled && styles.thumbDisabled, { transform: [{ translateX }] }]}
        {...responder.panHandlers}
      >
        <Text style={styles.thumbIcon}>›</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + spacing.sm * 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  trackDisabled: { backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.separator },
  label: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textOnDark,
    textAlign: "center",
    paddingHorizontal: THUMB,
  },
  labelDisabled: { color: colors.textSecondary },
  thumb: {
    position: "absolute",
    left: spacing.sm,
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDisabled: { backgroundColor: colors.textTertiary },
  thumbIcon: { fontSize: 28, color: colors.textOnDark, fontWeight: "700" },
});
