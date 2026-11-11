import React from "react";
import { router } from "expo-router";

import { useHasOpenShift } from "../../lib/expenses/money-glance-hooks";
import { useExpenseCategories } from "../../lib/expenses/use-expenses";
import { isTabReachable } from "../../lib/tab-visibility";
import { useTabVisibilityContext } from "../../lib/use-tab-visibility-context";
import { Button } from "../Button";

/** The Drawer screen, asked to open "Pay from the drawer" (ShiftCard reads `pay`). */
export const PAY_OUT_HREF = "/(main)/pos-sales?pay=1";

/**
 * The register's "Pay out" (design brief, contract "POS Pay out"): one tap
 * from the counter to paying ice or LPG from the open drawer. Shown only
 * while this person has a shift open and the store's expense categories are
 * on the phone — the same sheet the Drawer's "Pay an expense" opens.
 */
export function PayOutButton() {
  const ctx = useTabVisibilityContext();
  const canReachDrawer = isTabReachable("pos-sales", ctx);
  const hasOpenShift = useHasOpenShift(canReachDrawer);
  const { categories } = useExpenseCategories();
  if (!canReachDrawer || !hasOpenShift || categories.length === 0) return null;
  return (
    <Button
      label="Pay out"
      icon="cash-out"
      tone="secondary"
      size="sm"
      fullWidth={false}
      onPress={() => router.push(PAY_OUT_HREF as never)}
      accessibilityHint="Pay an expense from your drawer"
    />
  );
}
