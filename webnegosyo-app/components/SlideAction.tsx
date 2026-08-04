import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Animated,
  PanResponder,
  Text,
  type LayoutChangeEvent,
} from "react-native";
import { colors, typography, shadow } from "../theme/colors";
import { isSlideComplete } from "../lib/slide-gesture";

const SLIDE_HEIGHT = 60;
const KNOB_SIZE = 52;
const SLIDE_PADDING = 4;

interface SlideActionProps {
  /** Text shown on the track, e.g. "Slide to confirm pickup". */
  label: string;
  onComplete: () => void;
  /** Swaps the knob for a spinner and refuses further gestures. */
  isBusy?: boolean;
}

/**
 * A deliberate, hard-to-trigger-by-accident confirmation gesture.
 *
 * Used where a tap would be too cheap: accepting a handoff order into the
 * queue, and confirming a customer has collected their food. Both write
 * something that is awkward to walk back, and both happen with a phone held
 * one-handed over a counter.
 */
export function SlideAction({ label, onComplete, isBusy = false }: SlideActionProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);

  const maxSlide = Math.max(0, trackWidth - KNOB_SIZE - SLIDE_PADDING * 2);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isBusy && !completedRef.current,
        onMoveShouldSetPanResponder: () => !isBusy && !completedRef.current,
        onPanResponderMove: (_, gesture) => {
          if (maxSlide <= 0) return;
          const x = Math.min(Math.max(0, gesture.dx), maxSlide);
          translateX.setValue(x);
        },
        onPanResponderRelease: (_, gesture) => {
          if (maxSlide <= 0) return;
          if (isSlideComplete(gesture.dx, maxSlide)) {
            completedRef.current = true;
            Animated.timing(translateX, {
              toValue: maxSlide,
              duration: 120,
              // JS driver: the same value also drives `width`/opacity below,
              // which the native driver cannot animate.
              useNativeDriver: false,
            }).start(() => onComplete());
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: false,
              bounciness: 0,
            }).start();
          }
        },
      }),
    [maxSlide, isBusy, onComplete, translateX]
  );

  // Track-fill width and label fade follow the knob position.
  const fillWidth = translateX.interpolate({
    inputRange: [0, Math.max(1, maxSlide)],
    outputRange: [KNOB_SIZE + SLIDE_PADDING * 2, trackWidth || KNOB_SIZE],
    extrapolate: "clamp",
  });
  const labelOpacity = translateX.interpolate({
    inputRange: [0, Math.max(1, maxSlide) * 0.6],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.slideTrack} onLayout={handleLayout}>
      <Animated.View style={[styles.slideFill, { width: fillWidth }]} pointerEvents="none" />
      <Animated.Text
        style={[styles.slideLabel, { opacity: labelOpacity }]}
        pointerEvents="none"
      >
        {label}
      </Animated.Text>
      <Animated.View
        style={[styles.slideKnob, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {isBusy ? (
          <ActivityIndicator color={colors.success} />
        ) : (
          <Text style={styles.slideKnobArrow}>›››</Text>
        )}
      </Animated.View>
    </View>
  );
}


const styles = StyleSheet.create({
  slideTrack: {
    height: SLIDE_HEIGHT,
    borderRadius: SLIDE_HEIGHT / 2,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    justifyContent: "center",
    overflow: "hidden",
  },
  slideFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.success,
    borderRadius: SLIDE_HEIGHT / 2,
  },
  slideLabel: {
    ...typography.heading,
    color: colors.textSecondary,
    textAlign: "center",
  },
  slideKnob: {
    position: "absolute",
    left: SLIDE_PADDING,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  slideKnobArrow: {
    color: colors.success,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -2,
  },
});
