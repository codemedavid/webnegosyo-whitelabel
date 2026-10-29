import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { kds } from "./TicketCard";

interface RingStatusBarProps {
  /** Tickets ringing now (arrived while the board was open, not confirmed). */
  ringingCount: number;
  /** Unconfirmed tickets that were already on the board — no ring. */
  waitingCount: number;
  onTestSound: () => void;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The board's sound line: is anything ringing, and does the tablet actually
 * make a sound? "Test sound" plays the ringtone once, so a cook can check the
 * volume before a rush instead of finding out during one.
 */
export function RingStatusBar({ ringingCount, waitingCount, onTestSound }: RingStatusBarProps) {
  const isRinging = ringingCount > 0;
  const message = isRinging
    ? `🔔 Ringing — ${plural(ringingCount, "new order")} waiting for Confirm`
    : waitingCount > 0
      ? `${plural(waitingCount, "order")} not confirmed yet`
      : "🔔 Sound on · new orders ring until confirmed";

  return (
    <View style={[styles.bar, isRinging && styles.barRinging]} accessibilityLiveRegion="polite">
      <Text
        style={[styles.text, isRinging ? styles.textRinging : waitingCount > 0 ? styles.textWaiting : null]}
        numberOfLines={2}
      >
        {message}
      </Text>
      <TouchableOpacity
        style={styles.testButton}
        onPress={onTestSound}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Test sound"
      >
        <Text style={styles.testText}>Test sound</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: kds.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: kds.cardBorder,
  },
  barRinging: {
    backgroundColor: kds.ringing,
    borderColor: kds.urgent,
  },
  text: {
    flex: 1,
    color: kds.inkSoft,
    fontSize: 14,
    fontWeight: "700",
  },
  textRinging: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  textWaiting: {
    color: kds.warning,
  },
  testButton: {
    borderWidth: 1,
    borderColor: kds.cardBorder,
    backgroundColor: kds.print,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  testText: {
    color: kds.ink,
    fontSize: 12,
    fontWeight: "700",
  },
});
