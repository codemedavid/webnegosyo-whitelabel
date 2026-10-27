import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Keypad, type KeypadPress } from "../Keypad";

/** Approver PINs are 4–6 digits, like the Senior/PWD manager PIN. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

interface PinPadProps {
  value: string;
  onChange: (pin: string) => void;
  /** "Maria, enter your PIN". */
  title?: string;
  /** Fixed number of digits; otherwise 4–6 and the dots grow as digits are typed. */
  length?: number;
  /** "That PIN didn't work. 2 tries left." — the caller words it. */
  error?: string | null;
  /** "Maria's PIN is locked for 15 minutes. Send to her phone instead." Disables the pad. */
  lockoutMessage?: string | null;
  isDisabled?: boolean;
}

/** One key on a PIN → the next PIN. Digits only, never past `max`. */
export function nextPin(pin: string, key: KeypadPress, max: number): string {
  if (key === "backspace") return pin.slice(0, -1);
  if (key === "clear") return "";
  if (!/^[0-9]$/.test(key)) return pin;
  return pin.length >= max ? pin : pin + key;
}

/**
 * A manager PIN typed on the cashier's tablet ("PIN here now"). Dots only —
 * the digits are never drawn or read back; a screen reader hears "3 of 6
 * entered". Errors and lockouts are worded by the caller (the PIN service owns
 * tries and locks) and shown under the dots.
 */
export function PinPad({ value, onChange, title, length, error, lockoutMessage, isDisabled = false }: PinPadProps) {
  const max = length ?? PIN_MAX_LENGTH;
  const dots = length ?? Math.max(PIN_MIN_LENGTH, value.length);
  const isLocked = Boolean(lockoutMessage);
  const message = lockoutMessage ?? error ?? null;
  return (
    <View style={styles.wrap} testID="pin-pad">
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`${value.length} of ${max} entered`}
        accessibilityLiveRegion="polite"
        testID="pin-dots"
      >
        {Array.from({ length: dots }, (_, index) => (
          <View key={index} style={[styles.dot, index < value.length && styles.dotFilled, message !== null && styles.dotError]} />
        ))}
      </View>
      {message ? (
        <Text style={styles.message} accessibilityLiveRegion="assertive" testID="pin-message">
          {message}
        </Text>
      ) : null}
      <Keypad mode="pin" onKey={(key) => onChange(nextPin(value, key, max))} isDisabled={isDisabled || isLocked} testIDPrefix="pin-key" />
    </View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.md, minHeight: 20, alignItems: "center" },
  dot: { width: DOT, height: DOT, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.textMuted },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotError: { borderColor: colors.danger },
  message: { ...typography.caption, color: colors.danger, fontWeight: "600", textAlign: "center" },
});
