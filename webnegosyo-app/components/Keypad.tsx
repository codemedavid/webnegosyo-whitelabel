import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { KeypadKey } from "../lib/expenses/keypad";
import { colors } from "../theme/colors";
import { Icon } from "./Icon";

/**
 * The app's own number pad, in three modes (06 §5 "Keypad"):
 *
 *   amount  today's Expenses pad: digits, `00`, ⌫. Long-press `00` = centavos,
 *           long-press ⌫ = clear. Feed the keys to `pressKey` (lib/expenses/keypad).
 *   count   digits, ⌫ and Next ↓ where `00` was, so a whole drawer count is
 *           digits + Next with no hunting. Long-press ⌫ = clear.
 *           Feed digits to `pressCountKey` (lib/cash/denominations).
 *   pin     digits and ⌫ only, nothing to echo: the PIN's dots live in PinPad.
 *
 * `ExpenseKeypad` is this pad in amount mode (it keeps its own sizing helpers
 * and never dims disabled keys, as before).
 */
export type KeypadMode = "amount" | "count" | "pin";

/** Every key this pad sends: the Expenses keys plus `next` (count mode). */
export type KeypadPress = KeypadKey | "next";

/** Same heights as the Expenses pad (`sheetSizing`); 54–64 meets the 48pt floor. */
export const KEYPAD_KEY_HEIGHT = 54;

const LONG_PRESS_MS = 350;
const KEY_RADIUS = 12;

type Slot = KeypadPress | "blank";

const DIGIT_ROWS: readonly (readonly Slot[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

const LAST_ROW: Record<KeypadMode, readonly Slot[]> = {
  amount: ["00", "0", "backspace"],
  count: ["next", "0", "backspace"],
  pin: ["blank", "0", "backspace"],
};

interface KeypadProps {
  mode: KeypadMode;
  onKey: (key: KeypadPress) => void;
  keyHeight?: number;
  isDisabled?: boolean;
  /** Count mode: the Next key's word ("Next" by default; "Done" on the last row). */
  nextLabel?: string;
  isNextDisabled?: boolean;
  testIDPrefix?: string;
  /** Fade disabled keys (default). The Expenses pad never did, and keeps its look. */
  shouldDimWhenDisabled?: boolean;
}

function keyLabel(key: KeypadPress, mode: KeypadMode, nextLabel: string): string {
  if (key === "backspace") return mode === "pin" ? "Delete last digit" : "Delete last digit. Hold to clear";
  if (key === "00") return "Double zero. Hold to type centavos";
  if (key === "next") return nextLabel;
  return key;
}

function longPressFor(key: KeypadPress, mode: KeypadMode, onKey: KeypadProps["onKey"]): (() => void) | undefined {
  if (mode === "pin") return undefined;
  if (key === "backspace") return () => onKey("clear");
  if (key === "00" && mode === "amount") return () => onKey("decimal");
  return undefined;
}

interface KeyProps {
  slot: Slot;
  mode: KeypadMode;
  onKey: KeypadProps["onKey"];
  height: number;
  isDisabled: boolean;
  isNextDisabled: boolean;
  nextLabel: string;
  testIDPrefix: string;
  shouldDim: boolean;
}

function Key({ slot, mode, onKey, height, isDisabled, isNextDisabled, nextLabel, testIDPrefix, shouldDim }: KeyProps) {
  if (slot === "blank") return <View style={[styles.key, styles.blank, { height }]} />;
  const isNext = slot === "next";
  const disabled = isDisabled || (isNext && isNextDisabled);
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onKey(slot)}
      onLongPress={longPressFor(slot, mode, onKey)}
      delayLongPress={LONG_PRESS_MS}
      style={({ pressed }) => [
        styles.key,
        { height },
        isNext && styles.next,
        pressed && (isNext ? styles.nextPressed : styles.pressed),
        disabled && shouldDim && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={keyLabel(slot, mode, nextLabel)}
      accessibilityState={{ disabled }}
      testID={`${testIDPrefix}-${slot}`}
    >
      {slot === "backspace" ? (
        <Icon name="backspace" size={24} color={colors.textPrimary} />
      ) : isNext ? (
        <View style={styles.nextBody}>
          <Text style={styles.nextText} numberOfLines={1}>
            {nextLabel}
          </Text>
          <Icon name="arrow-down" size={16} color={colors.textOnDark} />
        </View>
      ) : (
        <Text style={styles.digit}>{slot}</Text>
      )}
    </Pressable>
  );
}

export function Keypad({
  mode,
  onKey,
  keyHeight = KEYPAD_KEY_HEIGHT,
  isDisabled = false,
  nextLabel = "Next",
  isNextDisabled = false,
  testIDPrefix = "keypad",
  shouldDimWhenDisabled = true,
}: KeypadProps) {
  const rows = [...DIGIT_ROWS, LAST_ROW[mode]];
  return (
    <View style={styles.pad}>
      {rows.map((row) => (
        <View key={row.join("")} style={styles.row}>
          {row.map((slot) => (
            <Key
              key={slot}
              slot={slot}
              mode={mode}
              onKey={onKey}
              height={keyHeight}
              isDisabled={isDisabled}
              isNextDisabled={isNextDisabled}
              nextLabel={nextLabel}
              testIDPrefix={testIDPrefix}
              shouldDim={shouldDimWhenDisabled}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 6 },
  row: { flexDirection: "row", gap: 6 },
  key: {
    flex: 1,
    borderRadius: KEY_RADIUS,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  blank: { backgroundColor: "transparent" },
  pressed: { backgroundColor: colors.separator },
  disabled: { opacity: 0.4 },
  digit: { fontSize: 22, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  next: { backgroundColor: colors.primary },
  nextPressed: { backgroundColor: colors.heroInkElevated },
  nextBody: { flexDirection: "row", alignItems: "center", gap: 4 },
  nextText: { fontSize: 15, fontWeight: "800", color: colors.textOnDark },
});
