import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { spokenCents } from "../../lib/expenses/expense-format";
import { colors } from "../../theme/colors";

const SYMBOL_SCALE = 0.55;
/**
 * Large accessibility text grows the amount at most this much: it is already
 * the biggest thing on the sheet, and the size steps below are worked out for
 * it (`ExpenseAmount.test.tsx` checks the longest amount at 320–430pt).
 */
export const AMOUNT_MAX_FONT_SCALE = 1.2;
/** Last-resort shrink if a phone is narrower than any of those. */
const MIN_FIT_SCALE = 0.6;
const CARET_BLINK_MS = 530;
/** Digit size by how many characters are shown ("1,050" = 5), so a long amount steps down instead of clipping. */
const SIZE_STEPS: readonly { maxChars: number; scale: number }[] = [
  { maxChars: 7, scale: 1 },
  { maxChars: 10, scale: 0.82 },
  { maxChars: Number.POSITIVE_INFINITY, scale: 0.68 },
];

export function amountDigitSize(body: string, baseSize: number): number {
  const step = SIZE_STEPS.find((candidate) => body.length <= candidate.maxChars) ?? SIZE_STEPS[SIZE_STEPS.length - 1];
  return Math.round(baseSize * (step?.scale ?? 1));
}

interface ExpenseAmountProps {
  /** The keypad's display, "₱1,050" / "₱80.5" — the ₱ is drawn separately. */
  text: string;
  cents: number;
  /** Digit size before long amounts step down: 40 short screens, 46 most, 54 tall. */
  baseSize: number;
}

/**
 * The amount being typed: left aligned, a small light ₱, big equal-width
 * digits and a blinking coral caret where the next digit lands.
 */
export function ExpenseAmount({ text, cents, baseSize }: ExpenseAmountProps) {
  const body = text.replace(/^₱/, "");
  const size = amountDigitSize(body, baseSize);
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

  const lineHeight = Math.round(baseSize * 1.15);
  return (
    <View
      style={[styles.row, { minHeight: lineHeight }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Amount: ${spokenCents(cents)}`}
      accessibilityLiveRegion="polite"
    >
      <Text
        style={[styles.symbol, { fontSize: Math.round(size * SYMBOL_SCALE), lineHeight: Math.round(size * 1.1) }]}
        maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}
      >
        ₱
      </Text>
      <Text
        style={[styles.digits, { fontSize: size, lineHeight: Math.round(size * 1.1) }, cents === 0 && styles.empty]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MIN_FIT_SCALE}
        maxFontSizeMultiplier={AMOUNT_MAX_FONT_SCALE}
      >
        {body}
      </Text>
      <Animated.View style={[styles.caret, { height: Math.round(size * 0.74), opacity: blink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  symbol: { fontWeight: "700", color: colors.textTertiary },
  digits: { fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"], letterSpacing: -0.8, flexShrink: 1 },
  empty: { color: colors.textTertiary },
  caret: { width: 3, borderRadius: 2, backgroundColor: colors.accent },
});
