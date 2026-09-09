import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "../../theme/colors";

/**
 * The spotlight: dims the whole simulated screen except the one control the
 * step is about, and lets touches through only there.
 *
 * `CoachTarget` wraps the control and keeps reporting its window frame while
 * it is the active target (the scene may scroll or animate under it).
 * `SpotlightOverlay` sits above the scene and draws four opaque panels around
 * the hole — panels, not a single view with a cut-out, because a panel can
 * swallow touches and a hole cannot. A pulsing ring marks the edge.
 */

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SetFrame = (frame: Frame | null) => void;

// Two contexts on purpose: targets subscribe only to the stable setter, so
// storing a frame never re-renders (and never re-measures) the target that
// reported it. The overlay alone reads the frame.
const SetFrameContext = createContext<SetFrame | null>(null);
const FrameContext = createContext<Frame | null>(null);

function isSameFrame(a: Frame | null, b: Frame | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The active target's window frame, for whoever must stay out of its way. */
export function useSpotlightFrame(): Frame | null {
  return useContext(FrameContext);
}

export function SpotlightProvider({ children }: { children: React.ReactNode }) {
  const [frame, setFrameState] = useState<Frame | null>(null);
  // Identity-stable, and a no-op for an unchanged frame so the periodic
  // re-measure never causes a render.
  const setFrame = useCallback<SetFrame>((next) => {
    setFrameState((prev) => (isSameFrame(prev, next) ? prev : next));
  }, []);
  return (
    <SetFrameContext.Provider value={setFrame}>
      <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
    </SetFrameContext.Provider>
  );
}

const REMEASURE_MS = 400;
const DEFAULT_PADDING = 6;

interface CoachTargetProps {
  /** Only the active target is spotlit; inactive ones render plainly. */
  active: boolean;
  children: React.ReactNode;
  /** Breathing room between the control and the hole's edge. */
  padding?: number;
  style?: ViewStyle;
}

export function CoachTarget({ active, children, padding = DEFAULT_PADDING, style }: CoachTargetProps) {
  const setFrame = useContext(SetFrameContext);
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    if (!setFrame || !active) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width === 0 && height === 0) return;
      setFrame({
        x: Math.round(x - padding),
        y: Math.round(y - padding),
        width: Math.round(width + padding * 2),
        height: Math.round(height + padding * 2),
      });
    });
  }, [setFrame, active, padding]);

  useEffect(() => {
    if (!active) return;
    measure();
    const id = setInterval(measure, REMEASURE_MS);
    return () => {
      clearInterval(id);
      setFrame?.(null);
    };
  }, [active, measure, setFrame]);

  const onLayout = useCallback(() => measure(), [measure]);

  return (
    <View ref={ref} onLayout={onLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}

const DIM = "rgba(29,24,21,0.62)";
const LARGE = 4000;

/**
 * Draws the mask. `visible` false fades everything out so the merchant sees
 * the whole screen — the "after" state — once they have done the step.
 */
export function SpotlightOverlay({ visible, clampBottom }: { visible: boolean; clampBottom?: number }) {
  const raw = useContext(FrameContext);
  // A target that sits partly below the scroll area (behind the scene's tab
  // bar) must not uncover the bar too: the hole stops where the bar starts,
  // unless the target IS on the bar.
  const frame =
    raw && clampBottom !== undefined && raw.y < clampBottom && raw.y + raw.height > clampBottom
      ? { ...raw, height: clampBottom - raw.y }
      : raw;
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const isShown = visible && frame !== null;

  useEffect(() => {
    Animated.timing(fade, { toValue: isShown ? 1 : 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [isShown, fade]);

  useEffect(() => {
    if (!isShown) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isShown, pulse]);

  if (!frame) return null;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 0.35, 0] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fade }]}
      pointerEvents={isShown ? "box-none" : "none"}
    >
      <View style={[styles.panel, { top: -LARGE, left: -LARGE, right: -LARGE, height: LARGE + frame.y }]} />
      <View style={[styles.panel, { top: bottom, left: -LARGE, right: -LARGE, height: LARGE }]} />
      <View style={[styles.panel, { top: frame.y, left: -LARGE, width: LARGE + frame.x, height: frame.height }]} />
      <View style={[styles.panel, { top: frame.y, left: right, width: LARGE, height: frame.height }]} />
      <View pointerEvents="none" style={[styles.edge, { top: frame.y, left: frame.x, width: frame.width, height: frame.height }]} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { top: frame.y, left: frame.x, width: frame.width, height: frame.height, opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", backgroundColor: DIM },
  edge: { position: "absolute", borderRadius: radius.md, borderWidth: 2, borderColor: colors.tabBarActive },
  ring: { position: "absolute", borderRadius: radius.md, borderWidth: 2, borderColor: colors.tabBarActive },
});
