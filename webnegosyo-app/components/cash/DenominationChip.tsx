import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Denomination } from "../../lib/cash/denominations";
import { radius } from "../../theme/colors";
import { denominationLook } from "./denomination-look";

interface DenominationChipProps {
  denomination: Denomination;
}

/**
 * The value mark at the head of a count row: a wide rounded note for a bill, a
 * circle for a coin, so the two ₱20 rows can't be mistaken for each other.
 * Decorative for screen readers — the row says "₱20 bills" / "₱20 coins".
 */
export function DenominationChip({ denomination }: DenominationChipProps) {
  const look = denominationLook(denomination.key);
  const isBill = denomination.kind === "bill";
  return (
    <View
      style={[isBill ? styles.bill : styles.coin, { backgroundColor: look.background, borderColor: look.ink }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[isBill ? styles.billText : styles.coinText, { color: look.ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {denomination.label}
      </Text>
    </View>
  );
}

const COIN_SIZE = 36;

const styles = StyleSheet.create({
  bill: {
    width: 64,
    height: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  coin: {
    width: COIN_SIZE,
    height: COIN_SIZE,
    borderRadius: radius.full,
    marginHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  billText: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  coinText: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
