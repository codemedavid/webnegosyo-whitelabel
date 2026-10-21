import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { spokenCents } from "../../lib/expenses/expense-format";
import { colors } from "../../theme/colors";

const DIGIT_SIZE = 46;
const COMPACT_DIGIT_SIZE = 40;
const SYMBOL_SCALE = 0.55;
const CARET_BLINK_MS = 530;

interface ExpenseAmountProps {
  /** The keypad's display, "₱1,050" / "₱80.5" — the ₱ is drawn separately. */
  text: string;
  cents: number;
  isCompact?: boolean;
}

/**
 * The amount being typed: left aligned, a small light ₱, big equal-width
 * digits and a blinking coral caret where the next digit lands.
 */
export function ExpenseAmount({ text, cents, isCompact = false }: ExpenseAmountProps) {
  const size = isCompact ? COMPACT_DIGIT_SIZE : DIGIT_SIZE;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 0, delay: CARET_BLINK_MS, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 0, delay: CARET_BLINK_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Amount: ${spokenCents(cents)}`}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.symbol, { fontSize: Math.round(size * SYMBOL_SCALE) }]}>₱</Text>
      <Text
        style={[styles.digits, { fontSize: size, lineHeight: Math.round(size * 1.1) }, cents === 0 && styles.empty]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {text.replace(/^₱/, "")}
      </Text>
      <Animated.View style={[styles.caret, { height: Math.round(size * 0.78), opacity: blink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  symbol: { fontWeight: "700", color: colors.textTertiary, alignSelf: "flex-end", marginBottom: 6 },
  digits: { fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.8, flexShrink: 1 },
  empty: { color: colors.textTertiary },
  caret: { width: 2.5, borderRadius: 2, backgroundColor: colors.accent, marginLeft: 2 },
});
