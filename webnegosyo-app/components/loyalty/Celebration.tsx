import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Modal } from "../Modal";

import { colors, spacing, typography } from "../../theme/colors";

/**
 * The "you did it" moment after a card is saved: a burst of the card's own
 * reward icons falling past a big headline. Tapping anywhere closes it, and it
 * closes itself, so it never stands between the merchant and their next task.
 */

const PARTICLES = 22;
const FALL_MS = 1800;
const AUTO_CLOSE_MS = 2800;

interface CelebrationProps {
  isVisible: boolean;
  title: string;
  message: string;
  /** Icons to rain down — the rewards the merchant just put on the card. */
  emojis: string[];
  onDone: () => void;
}

interface Particle {
  emoji: string;
  left: number;
  delay: number;
  spin: number;
  size: number;
}

function makeParticles(emojis: string[], width: number): Particle[] {
  const pool = emojis.length ? [...emojis, "🎉", "✨"] : ["🎉", "✨", "⭐"];
  // Deterministic spread (no Math.random) so renders and tests are stable.
  return Array.from({ length: PARTICLES }, (_, index) => ({
    emoji: pool[index % pool.length],
    left: ((index * 37) % 100) / 100 * (width - 40),
    delay: (index % 7) * 90,
    spin: index % 2 === 0 ? 1 : -1,
    size: 22 + (index % 4) * 6,
  }));
}

export function Celebration({ isVisible, title, message, emojis, onDone }: CelebrationProps) {
  const { width, height } = Dimensions.get("window");
  const particles = useMemo(() => makeParticles(emojis, width), [emojis, width]);
  const fall = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isVisible) return;
    fall.setValue(0);
    pop.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(fall, { toValue: 1, duration: FALL_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]);
    animation.start();
    const timer = setTimeout(onDone, AUTO_CLOSE_MS);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [isVisible, fall, pop, onDone]);

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onDone}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDone} accessibilityRole="button" accessibilityLabel={`${title}. ${message}. Tap to continue`}>
        {particles.map((particle, index) => (
          <Animated.Text
            key={index}
            style={[
              styles.particle,
              {
                left: particle.left,
                fontSize: particle.size,
                transform: [
                  { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-80 - particle.delay, height + 40] }) },
                  { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${particle.spin * 300}deg`] }) },
                ],
              },
            ]}
          >
            {particle.emoji}
          </Animated.Text>
        ))}
        <Animated.View style={[styles.badge, { transform: [{ scale: pop }] }]}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
        <View />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(29,24,21,0.72)", alignItems: "center", justifyContent: "center" },
  particle: { position: "absolute", top: 0 },
  badge: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 320,
  },
  trophy: { fontSize: 64 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
