import React from "react";
import { StyleSheet, View } from "react-native";

import { SegmentedControl } from "../SegmentedControl";
import { resolveItemSummaryAccess } from "../../lib/reports/item-summary";
import type { RefRoute } from "../../lib/backends/route";
import type { StaffPermissionHolder } from "../../lib/staff-permissions";
import { spacing } from "../../theme/colors";

export type OrderHistoryView = "orders" | "summary";

const VIEWS: readonly { label: string; value: OrderHistoryView }[] = [
  { label: "Orders", value: "orders" },
  { label: "Item summary", value: "summary" },
];

interface OrderHistoryViewSwitchProps {
  holder: StaffPermissionHolder;
  route: RefRoute;
  /** False on the live queue: the summary is about picked days. */
  isDated: boolean;
  view: OrderHistoryView;
  onChange: (view: OrderHistoryView) => void;
}

/**
 * "Orders | Item summary" under the period bar. Drawn only for an account
 * that may see whole-store sales (`reports`) once days are picked — a cashier
 * holding `orders` never sees a locked tab (owner decision, 2026-11-04).
 */
export function OrderHistoryViewSwitch({ holder, route, isDated, view, onChange }: OrderHistoryViewSwitchProps) {
  if (resolveItemSummaryAccess({ holder, route, isDated }) === "hidden") return null;
  return (
    <View style={styles.row}>
      <SegmentedControl options={VIEWS} value={view} onChange={onChange} accessibilityPrefix="Show" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: spacing.md },
});
