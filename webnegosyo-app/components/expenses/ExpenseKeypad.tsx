import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { KeypadKey } from "../../lib/expenses/keypad";
import { colors } from "../../theme/colors";
import { Icon } from "../Icon";

/** Key height on a normal phone; shorter on a small screen so the amount never shrinks first. */
export const KEY_HEIGHT = 54;
export const COMPACT_KEY_HEIGHT = 44;
/** Tall phones (Pro Max, Plus) get bigger keys and digits instead of an empty band above the keypad. */
export const TALL_KEY_HEIGHT = 64;

const COMPACT_WINDOW = 740;
const TALL_WINDOW = 880;

export interface SheetSizing {
  /** Keypad key height. */
  key: number;
  /** Amount digit size before long amounts step down. */
  amount: number;
}

export function sheetSizing(windowHeight: number): SheetSizing {
  if (windowHeight < COMPACT_WINDOW) return { key: COMPACT_KEY_HEIGHT, amount: 40 };
  if (windowHeight >= TALL_WINDOW) return { key: TALL_KEY_HEIGHT, amount: 54 };
  return { key: KEY_HEIGHT, amount: 46 };
}

const KEY_RADIUS = 12;

const ROWS: readonly (readonly KeypadKey[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["00", "0", "backspace"],
];

interface ExpenseKeypadProps {
  onKey: (key: KeypadKey) => void;
  keyHeight?: number;
  isDisabled?: boolean;
}

function keyLabel(key: KeypadKey): string {
  if (key === "backspace") return "Delete last digit. Hold to clear";
  if (key === "00") return "Double zero. Hold to type centavos";
  return key;
}

/**
 * Our own number pad (plan §5.1): the OS keyboard covers half the sheet and
 * changes shape between phones; this one is always in the same place under
 * the cashier's thumb. Long-press `00` for centavos, long-press delete to clear.
 * Keys are soft rounded tiles on the card, like the register's pad.
 */
export function ExpenseKeypad({ onKey, keyHeight = KEY_HEIGHT, isDisabled = false }: ExpenseKeypadProps) {
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join("")} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              disabled={isDisabled}
              onPress={() => onKey(key)}
              onLongPress={key === "00" ? () => onKey("decimal") : key === "backspace" ? () => onKey("clear") : undefined}
              delayLongPress={350}
              style={({ pressed }) => [styles.key, { height: keyHeight }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={keyLabel(key)}
              testID={`keypad-${key}`}
            >
              {key === "backspace" ? (
                <Icon name="backspace" size={24} color={colors.textPrimary} />
              ) : (
                <Text style={styles.digit}>{key}</Text>
              )}
            </Pressable>
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
  pressed: { backgroundColor: colors.separator },
  digit: { fontSize: 22, fontWeight: "600", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
});
