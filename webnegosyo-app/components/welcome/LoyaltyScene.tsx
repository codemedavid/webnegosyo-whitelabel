import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { WELCOME_COLORS } from "../../lib/welcome/slides";
import { Rise } from "./Rise";
import { sceneStyles } from "./scene-styles";
import { useAfter } from "./use-after";

/** When each of the seven visit stamps lands; the reward slot fills last. */
const STAMP_DELAYS_MS = [200, 400, 700, 1000, 1150, 1300, 1450] as const;
const REWARD_STAMP_MS = 1800;
const UNLOCKED_MS = 2000;
const TYPING_ENDS_MS = 2450;
const MESSAGE_MS = 2500;

/** A stamp reads as landed a beat after it starts falling onto the card. */
const LANDING_MS = 250;
const ALL_STAMP_DELAYS_MS = [...STAMP_DELAYS_MS, REWARD_STAMP_MS];

/** How many stamps are on the card, counted as each one lands. */
function useLandedStamps(isReducedMotion: boolean): number {
  const [landed, setLanded] = useState(isReducedMotion ? ALL_STAMP_DELAYS_MS.length : 0);
  useEffect(() => {
    if (isReducedMotion) {
      setLanded(ALL_STAMP_DELAYS_MS.length);
      return;
    }
    const timers = ALL_STAMP_DELAYS_MS.map((delay, i) =>
      setTimeout(() => setLanded(i + 1), delay + LANDING_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [isReducedMotion]);
  return landed;
}

function CupIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z M16 10h1.5a2.5 2.5 0 0 1 0 5H16"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GiftIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1"
        fill="none"
        stroke={WELCOME_COLORS.ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TypingDots() {
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(beat, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [beat]);
  return (
    <View style={styles.typing} accessibilityLabel="Typing">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: beat.interpolate({
                inputRange: [0, 0.33 * i + 0.01, 0.33 * i + 0.33, 1],
                outputRange: [0.3, 0.3, 1, 0.3],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function LoyaltyScene({ isReducedMotion }: { isReducedMotion: boolean }) {
  const stamps = useLandedStamps(isReducedMotion);
  const isTyping = !useAfter(TYPING_ENDS_MS, isReducedMotion);

  return (
    <View style={sceneStyles.stage}>
      <Rise delay={100} isReducedMotion={isReducedMotion} style={[sceneStyles.card, styles.card]}>
        <View style={styles.header}>
          <View style={styles.storeBadge}>
            <Text style={styles.storeBadgeText}>KK</Text>
          </View>
          <View style={styles.grow}>
            <Text style={styles.storeName}>Kape Kanto</Text>
            <Text style={sceneStyles.rowMeta}>Ana’s stamp card</Text>
          </View>
          <Text style={styles.count}>
            {stamps}
            <Text style={styles.countOf}>/8</Text>
          </Text>
        </View>

        <View style={styles.grid}>
          {STAMP_DELAYS_MS.map((delay) => (
            <View key={delay} style={styles.slot}>
              <Rise delay={delay} motion="stamp" isReducedMotion={isReducedMotion} style={styles.stamp}>
                <CupIcon />
              </Rise>
            </View>
          ))}
          <View style={[styles.slot, styles.rewardSlot]}>
            <Rise delay={REWARD_STAMP_MS} motion="stamp" isReducedMotion={isReducedMotion} style={[styles.stamp, styles.rewardStamp]}>
              <GiftIcon />
            </Rise>
          </View>
        </View>

        <Rise delay={UNLOCKED_MS} motion="pop" isReducedMotion={isReducedMotion} style={styles.unlocked}>
          <Text style={styles.unlockedText}>Free Halo-halo unlocked</Text>
        </Rise>
      </Rise>

      <Rise delay={UNLOCKED_MS} isReducedMotion={isReducedMotion} style={styles.message}>
        <Text style={styles.messageFrom}>Text message · Kape Kanto</Text>
        <View style={styles.bubble}>
          {isTyping ? (
            <TypingDots />
          ) : (
            <Rise delay={isReducedMotion ? 0 : MESSAGE_MS - TYPING_ENDS_MS} isReducedMotion={isReducedMotion}>
              <Text style={styles.bubbleText}>
                Welcome back, Ana! Your free Halo-halo is ready on your next visit.
              </Text>
            </Rise>
          )}
        </View>
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { top: 34, shadowColor: "#783C00" },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  storeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WELCOME_COLORS.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  storeBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  grow: { flex: 1 },
  storeName: { fontSize: 15, fontWeight: "800", color: WELCOME_COLORS.ink },
  count: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, color: WELCOME_COLORS.ink },
  countOf: { color: "#B5B5B5" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  slot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#E3E3E3",
  },
  rewardSlot: { borderColor: WELCOME_COLORS.yellow },
  stamp: {
    flex: 1,
    margin: -2,
    borderRadius: 28,
    backgroundColor: WELCOME_COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardStamp: { backgroundColor: WELCOME_COLORS.yellow },
  unlocked: {
    marginTop: 18,
    height: 44,
    borderRadius: 14,
    backgroundColor: WELCOME_COLORS.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  unlockedText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  message: { position: "absolute", left: 28, right: 56, top: 326, gap: 4 },
  messageFrom: { fontSize: 11, fontWeight: "700", color: "#5A3B00" },
  bubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#783C00",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: WELCOME_COLORS.ink },
  typing: { flexDirection: "row", gap: 4, height: 19, alignItems: "center" },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#8A8A8A" },
});
