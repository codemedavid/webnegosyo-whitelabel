import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { demoSessionAuth } from "../../lib/demo";
import {
  WELCOME_AUTOPLAY_MS,
  WELCOME_COLORS,
  WELCOME_SLIDES,
  nextSlideIndex,
  slideIndexAfterSwipe,
  type WelcomeSlideId,
} from "../../lib/welcome/slides";
import { useReducedMotion, useScreenReaderEnabled } from "../../hooks/use-reduced-motion";
import { useAuthStore } from "../../stores/auth-store";
import { LoyaltyScene } from "./LoyaltyScene";
import { OrdersScene } from "./OrdersScene";
import { Rise } from "./Rise";
import { SalesScene } from "./SalesScene";
import { STAGE } from "./scene-styles";
import { WelcomeDots } from "./WelcomeDots";

/**
 * The first screen a signed-out merchant sees: three screens, each one result
 * the app gives a food business, then Log in or the demo. No sign-up — stores
 * are set up on the web after payment (Apple 3.1.1).
 */

const SCENES: Record<WelcomeSlideId, (props: { isReducedMotion: boolean }) => React.JSX.Element> = {
  orders: OrdersScene,
  loyalty: LoyaltyScene,
  sales: SalesScene,
};

/** The scene never grows past this on tablets, so it stays a phone-sized story. */
const MAX_STAGE_SCALE = 1.25;
const PANEL_FADE_MS = 600;
/** A drag this far sideways (and more sideways than down) is a swipe. */
const DRAG_START_PX = 12;
/**
 * The scenes keep their bottom strip empty, so the stage is fitted on this
 * height and that strip may be cropped on short screens.
 */
const STAGE_FIT_HEIGHT = 420;
/** Large Dynamic Type still grows the copy, but not past the buttons. */
const MAX_FONT_SCALE = 1.3;
/** iPhone SE-class screens get tighter copy so the scene stays readable. */
const COMPACT_HEIGHT_PX = 700;

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const isCompact = useWindowDimensions().height < COMPACT_HEIGHT_PX;
  const setAuth = useAuthStore((s) => s.setAuth);
  const isReducedMotion = useReducedMotion();
  // A screen reader user moves the screens with the dots; nothing changes under them.
  const isScreenReaderOn = useScreenReaderEnabled();
  // Log in is pushed on top of this screen, which stays mounted underneath: it must not keep playing there.
  const isFocused = useIsFocused();
  const isAutoplayOn = isFocused && !isReducedMotion && !isScreenReaderOn;
  const [index, setIndex] = useState(0);
  const [stageScale, setStageScale] = useState(1);
  const panelColor = useRef(new Animated.Value(0)).current;

  const count = WELCOME_SLIDES.length;
  const slide = WELCOME_SLIDES[index];
  const Scene = SCENES[slide.id];

  // Autoplay: each screen schedules the next, so a tap or swipe restarts the clock.
  useEffect(() => {
    if (!isAutoplayOn) return;
    const timer = setTimeout(() => setIndex((i) => nextSlideIndex(i, count)), WELCOME_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, isAutoplayOn, count]);

  useEffect(() => {
    Animated.timing(panelColor, {
      toValue: index,
      duration: isReducedMotion ? 0 : PANEL_FADE_MS,
      useNativeDriver: false,
    }).start();
  }, [index, isReducedMotion, panelColor]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > DRAG_START_PX && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_, g) => setIndex((i) => slideIndexAfterSwipe(i, g.dx, count)),
      }),
    [count]
  );

  const handlePanelLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStageScale(Math.min(width / STAGE.width, height / STAGE_FIT_HEIGHT, MAX_STAGE_SCALE));
  };

  const handleLogIn = () => router.push("/(auth)/login");

  const handleExploreDemo = () => {
    setAuth(demoSessionAuth());
    router.replace("/(main)/dashboard");
  };

  const backgroundColor = panelColor.interpolate({
    inputRange: WELCOME_SLIDES.map((_, i) => i),
    outputRange: WELCOME_SLIDES.map((s) => s.panelColor),
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style="dark" />
      <Text style={[styles.wordmark, isCompact && styles.wordmarkCompact]} accessibilityRole="header">
        Smart<Text style={styles.wordmarkAccent}>Menu</Text>
      </Text>

      <Animated.View
        style={[styles.panel, { backgroundColor }]}
        onLayout={handlePanelLayout}
        {...panResponder.panHandlers}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={{ transform: [{ scale: stageScale }] }}>
          <Scene key={slide.id} isReducedMotion={isReducedMotion} />
        </View>
      </Animated.View>

      <View style={[styles.copy, isCompact && styles.copyCompact]} accessibilityLiveRegion="polite">
        <WelcomeDots
          count={count}
          activeIndex={index}
          durationMs={WELCOME_AUTOPLAY_MS}
          isReducedMotion={!isAutoplayOn}
          onSelect={setIndex}
        />
        <Rise key={`h-${slide.id}`} delay={200} isReducedMotion={isReducedMotion}>
          <Text
            style={[styles.headline, isCompact && styles.headlineCompact]}
            accessibilityRole="header"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {slide.headline}
          </Text>
        </Rise>
        <Rise key={`b-${slide.id}`} delay={400} isReducedMotion={isReducedMotion}>
          <Text style={styles.body} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {slide.body}
          </Text>
        </Rise>
      </View>

      <View style={[styles.actions, isCompact && styles.actionsCompact]}>
        <Pressable
          onPress={handleLogIn}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logIn, pressed && styles.pressed]}
        >
          <Text style={styles.logInText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Log in
          </Text>
        </Pressable>
        <Pressable onPress={handleExploreDemo} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.demo} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            New here? <Text style={styles.demoLink}>Explore the demo store</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", backgroundColor: WELCOME_COLORS.canvas, paddingHorizontal: 16 },
  wordmark: {
    alignSelf: "center",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: WELCOME_COLORS.ink,
    marginBottom: 14,
  },
  wordmarkCompact: { marginBottom: 8 },
  wordmarkAccent: { color: WELCOME_COLORS.red },
  panel: {
    flex: 1,
    maxHeight: 560,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderRadius: 32,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { alignItems: "center", gap: 14, paddingTop: 22, paddingHorizontal: 12, minHeight: 168 },
  copyCompact: { gap: 10, paddingTop: 14, minHeight: 136 },
  headline: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -1.2,
    textAlign: "center",
    color: WELCOME_COLORS.ink,
  },
  headlineCompact: { fontSize: 28, lineHeight: 30, letterSpacing: -0.9 },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
    color: WELCOME_COLORS.muted,
    maxWidth: 340,
  },
  actions: { gap: 14, alignItems: "center", paddingTop: 20, width: "100%", maxWidth: 560, alignSelf: "center" },
  actionsCompact: { paddingTop: 10, gap: 10 },
  logIn: {
    alignSelf: "stretch",
    height: 56,
    borderRadius: 999,
    backgroundColor: WELCOME_COLORS.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  logInText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  demo: { fontSize: 14, fontWeight: "600", color: WELCOME_COLORS.muted },
  demoLink: { color: WELCOME_COLORS.ink, fontWeight: "800", textDecorationLine: "underline" },
});
