import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { WELCOME_COLORS } from "../../lib/welcome/slides";
import { Rise } from "./Rise";
import { sceneStyles } from "./scene-styles";
import { useCountUp } from "./use-count-up";

type BarTone = "quiet" | "busy" | "peak";

/** Orders per hour, 8 AM to 7 PM: a lunch rush peaking at noon and a dinner rush. */
const HOURLY_BARS: readonly { height: number; tone: BarTone }[] = [
  { height: 0.18, tone: "quiet" },
  { height: 0.3, tone: "quiet" },
  { height: 0.46, tone: "quiet" },
  { height: 0.82, tone: "busy" },
  { height: 1, tone: "peak" },
  { height: 0.58, tone: "quiet" },
  { height: 0.32, tone: "quiet" },
  { height: 0.28, tone: "quiet" },
  { height: 0.44, tone: "quiet" },
  { height: 0.76, tone: "busy" },
  { height: 0.86, tone: "busy" },
  { height: 0.5, tone: "quiet" },
];

const BAR_COLORS: Record<BarTone, string> = {
  quiet: "#EDEDED",
  busy: WELCOME_COLORS.ink,
  peak: WELCOME_COLORS.red,
};

const CHART_HEIGHT = 104;
const BAR_STAGGER_MS = 110;

function Bar({ height, tone, delay, isReducedMotion }: { height: number; tone: BarTone; delay: number; isReducedMotion: boolean }) {
  const grow = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion) {
      grow.setValue(1);
      return;
    }
    const animation = Animated.timing(grow, {
      toValue: 1,
      delay,
      duration: 600,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, grow, isReducedMotion]);
  return (
    <Animated.View
      style={[
        styles.bar,
        { height: CHART_HEIGHT * height, backgroundColor: BAR_COLORS[tone] },
        { transformOrigin: "bottom", transform: [{ scaleY: grow }] },
      ]}
    />
  );
}

function TrophyIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0V4Z M7 6H4v1a3 3 0 0 0 3 3 M17 6h3v1a3 3 0 0 1-3 3"
        fill="none"
        stroke={WELCOME_COLORS.red}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function StoreIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M3 21h18 M5 21V9l7-5 7 5v12 M9 21v-6h6v6"
        fill="none"
        stroke={WELCOME_COLORS.yellow}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SalesScene({ isReducedMotion }: { isReducedMotion: boolean }) {
  const orders = useCountUp(64, { delay: 300, duration: 1400, isReducedMotion });

  return (
    <View style={sceneStyles.stage}>
      <Rise delay={100} isReducedMotion={isReducedMotion} style={[sceneStyles.card, styles.card]}>
        <View style={styles.header}>
          <View>
            <Text style={sceneStyles.label}>Orders today</Text>
            <Text style={sceneStyles.bigNumber}>{orders}</Text>
          </View>
          <Rise delay={1000} motion="right" isReducedMotion={isReducedMotion} style={styles.sales}>
            <Text style={sceneStyles.label}>Sales</Text>
            <Text style={styles.salesValue}>₱18,450</Text>
          </Rise>
        </View>
        <View style={styles.chart}>
          {HOURLY_BARS.map((bar, i) => (
            <Bar key={i} height={bar.height} tone={bar.tone} delay={100 + i * BAR_STAGGER_MS} isReducedMotion={isReducedMotion} />
          ))}
        </View>
        <View style={styles.axis}>
          <Text style={styles.axisText}>8 AM</Text>
          <Text style={[styles.axisText, styles.axisPeak]}>12 PM peak</Text>
          <Text style={styles.axisText}>7 PM</Text>
        </View>
      </Rise>

      <Rise delay={1800} isReducedMotion={isReducedMotion} style={[sceneStyles.pill, styles.bestSeller]}>
        <View style={sceneStyles.iconTile}>
          <TrophyIcon />
        </View>
        <View>
          <Text style={sceneStyles.rowMeta}>Best seller today</Text>
          <Text style={styles.pillValue}>Sisig · 42 sold</Text>
        </View>
      </Rise>

      <Rise delay={2300} isReducedMotion={isReducedMotion} style={[sceneStyles.pill, styles.branches]}>
        <View style={[sceneStyles.iconTile, styles.darkTile]}>
          <StoreIcon />
        </View>
        <View>
          <Text style={[sceneStyles.rowMeta, styles.onDarkMuted]}>All branches</Text>
          <Text style={[styles.pillValue, styles.onDark]}>Main · Branch 2 · Branch 3</Text>
        </View>
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { top: 34, shadowOpacity: 0.35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sales: { alignItems: "flex-end" },
  salesValue: { fontSize: 24, lineHeight: 38, fontWeight: "800", letterSpacing: -0.5, color: WELCOME_COLORS.ink },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: CHART_HEIGHT, marginTop: 12 },
  bar: { flex: 1, borderRadius: 5 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  axisText: { fontSize: 11, fontWeight: "700", color: "#8A8A8A" },
  axisPeak: { color: WELCOME_COLORS.red },
  bestSeller: { top: 292 },
  branches: { top: 364, backgroundColor: "rgba(255,255,255,0.1)" },
  darkTile: { backgroundColor: "rgba(255,255,255,0.12)" },
  pillValue: { fontSize: 15, fontWeight: "800", color: WELCOME_COLORS.ink },
  onDark: { color: "#FFFFFF" },
  onDarkMuted: { color: "#BDBDBD" },
});
