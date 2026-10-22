import React from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";

import { spokenCents } from "../../lib/expenses/expense-format";
import { pesoParts } from "../../lib/expenses/money-text";

interface BigAmountProps {
  cents: number;
  color: string;
  /** Digit size; the ₱ is drawn at 60% of it. 40 heroes, 30 compact heroes. */
  size?: number;
  isStruck?: boolean;
  testID?: string;
}

const SYMBOL_SCALE = 0.6;

/**
 * One hero figure: a smaller ₱ then the digits, equal-width numerals, whole
 * pesos unless there are centavos (lib/expenses/money-text.ts).
 */
export function BigAmount({ cents, color, size = 40, isStruck = false, testID }: BigAmountProps) {
  const parts = pesoParts(cents);
  const digits: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.12), color };
  return (
    <Text
      testID={testID}
      style={[styles.digits, digits, isStruck && styles.struck]}
      accessibilityLabel={`${parts.sign ? "minus " : ""}${spokenCents(Math.abs(cents))}`}
    >
      {parts.sign}
      <Text style={[styles.symbol, { fontSize: Math.round(size * SYMBOL_SCALE) }]}>{parts.symbol}</Text>
      {parts.body}
    </Text>
  );
}

const styles = StyleSheet.create({
  digits: { fontWeight: "800", letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  symbol: { fontWeight: "700", opacity: 0.55 },
  struck: { textDecorationLine: "line-through", opacity: 0.6 },
});
