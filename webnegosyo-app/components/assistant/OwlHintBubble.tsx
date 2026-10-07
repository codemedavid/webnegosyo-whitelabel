import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../Icon";
import { colors, shadow } from "../../theme/colors";
import type { OwlHint } from "../../lib/assistant/owl-hints";

/** Lets the screen settle before the owl speaks. */
const SHOW_DELAY_MS = 900;
/** Long enough to read twice; then the bubble gets out of the way. */
const VISIBLE_MS = 9000;
const FADE_MS = 220;

type Props = {
  hint: OwlHint;
  /** Distance from the screen's bottom edge, lined up with the owl. */
  bottom: number;
  /** Distance from the screen's right edge, just left of the owl. */
  right: number;
  maxWidth: number;
  onAsk: () => void;
  onDismiss: () => void;
  /** The bubble timed out on its own. */
  onDone: () => void;
};

/**
 * The owl's speech bubble: what Owl can do here and one question to ask.
 * Tapping it asks that question; the cross hides the tips for good.
 */
export function OwlHintBubble({ hint, bottom, right, maxWidth, onAsk, onDismiss, onDone }: Props) {
  const appear = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const fade = (toValue: number) => Animated.timing(appear, { toValue, duration: FADE_MS, useNativeDriver: true });
    const sequence = Animated.sequence([Animated.delay(SHOW_DELAY_MS), fade(1), Animated.delay(VISIBLE_MS), fade(0)]);
    sequence.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => sequence.stop();
  }, [appear]);

  const lift = appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom, right, maxWidth, opacity: appear, transform: [{ translateY: lift }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${hint.title}. Ask Owl: ${hint.prompt}`}
        onPress={onAsk}
        style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
      >
        <View style={styles.text}>
          <Text style={styles.title}>{hint.title}</Text>
          <Text style={styles.prompt}>
            Ask me “{hint.prompt}” <Text style={styles.arrow}>→</Text>
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide Owl tips" onPress={onDismiss} hitSlop={10} style={styles.close}>
          <Icon name="close" size={14} color={colors.heroInkMuted} />
        </Pressable>
      </Pressable>
      <View style={styles.tail} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 41, flexDirection: "row", alignItems: "center" },
  bubble: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.heroInk,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
    ...shadow.md,
    elevation: 8,
  },
  pressed: { backgroundColor: colors.heroInkElevated },
  text: { flexShrink: 1, gap: 2 },
  title: { fontSize: 12, fontWeight: "600", color: colors.heroInkMuted },
  prompt: { fontSize: 14, fontWeight: "700", color: colors.heroInkText },
  arrow: { color: colors.tabBarActive },
  close: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tail: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.heroInk,
  },
});
