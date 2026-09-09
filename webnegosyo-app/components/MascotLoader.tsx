/**
 * The mascot loading screen: the owl animation above a progress bar.
 *
 * The animation is a GIF rather than an mp4 on purpose. The app ships no video
 * module (no expo-video / expo-av), and adding one is a native change that
 * needs a fresh EAS build — a GIF plays through the core `Image` on both
 * platforms today and is OTA-shippable. The source clip was cropped square and
 * its white studio background keyed out and flattened onto the app background,
 * so the owl sits on the screen colour instead of a white card.
 *
 * The bar is indeterminate by default (a sweep that never claims progress it
 * cannot know). Pass `progress` (0..1) when a caller can actually measure it.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, typography } from "../theme/colors";

const MASCOT_SIZE = { full: 180, compact: 120 } as const;
const BAR_WIDTH = 160;
const BAR_HEIGHT = 4;
/** The sweeping segment is this fraction of the track. */
const SWEEP_FRACTION = 0.4;
const SWEEP_DURATION_MS = 1100;

/**
 * A GIF carries no usable alpha, so the owl is flattened onto the surface it
 * will sit on: the app background, or a white card / footer.
 */
const MASCOT_ANIMATION = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  background: require("../assets/mascot-loading.gif"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  card: require("../assets/mascot-loading-card.gif"),
} as const;

export type MascotSurface = keyof typeof MASCOT_ANIMATION;

interface MascotLoaderProps {
  /** Short line under the bar. Omit for none. */
  message?: string;
  /** 0..1 for a determinate bar; omit for the indeterminate sweep. */
  progress?: number;
  /** Fill the screen with the app background (the splash use). */
  fullScreen?: boolean;
  /** `compact` for inline waits inside a screen; defaults to `full`. */
  size?: keyof typeof MASCOT_SIZE;
  /** The colour behind the owl: the app background (default) or a white card. */
  surface?: MascotSurface;
  testID?: string;
}

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

export function MascotLoader({
  message,
  progress,
  fullScreen = false,
  size = "full",
  surface = "background",
  testID = "mascot-loader",
}: MascotLoaderProps) {
  const mascotSize = MASCOT_SIZE[size];
  const isDeterminate = typeof progress === "number";
  const accessibilityValue = isDeterminate
    ? { min: 0, max: 100, now: Math.round(clampProgress(progress) * 100) }
    : undefined;

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreen]}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Loading"}
      accessibilityValue={accessibilityValue}
    >
      <Image
        source={MASCOT_ANIMATION[surface]}
        style={{ width: mascotSize, height: mascotSize }}
        resizeMode="contain"
        alt=""
        accessibilityIgnoresInvertColors
        testID={`${testID}-mascot`}
      />
      <View style={styles.track} testID={`${testID}-track`}>
        {isDeterminate ? (
          <View
            style={[styles.fill, { width: `${clampProgress(progress) * 100}%` }]}
            testID={`${testID}-fill`}
          />
        ) : (
          <IndeterminateSweep />
        )}
      </View>
      {message ? <Text style={styles.text}>{message}</Text> : null}
    </View>
  );
}

function IndeterminateSweep() {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(offset, {
        toValue: 1,
        duration: SWEEP_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [offset]);

  const sweepWidth = BAR_WIDTH * SWEEP_FRACTION;
  const translateX = offset.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepWidth, BAR_WIDTH],
  });

  return (
    <Animated.View
      style={[styles.fill, { width: sweepWidth, transform: [{ translateX }] }]}
      testID="mascot-loader-sweep"
    />
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 16 },
  fullScreen: { flex: 1, backgroundColor: colors.background },
  track: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    overflow: "hidden",
  },
  fill: {
    height: BAR_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  text: { ...typography.caption, color: colors.textSecondary },
});
