/**
 * A tap on a "Sold out" register tile: say why, and — for someone who may
 * change the menu — offer "Sell anyway until end of day" through the same
 * stock-aware switch as Products (`POST /api/inventory/dish-availability`).
 *
 * The switch is tried plainly first: a dish that was only switched off just
 * comes back on. When the route answers that the stock count can't make it,
 * the cashier has already chosen to sell anyway, so it is re-sent with
 * `sellAnyway: true` (auto-86 then leaves it alone until end of day).
 *
 * Only the dish's OWN switch can be overridden here. A dish sold out because
 * every required choice is off needs those choices turned on in Products.
 */

import { useCallback, useState } from "react";
import { DISH_SOLD_OUT_REASON } from "./query/use-pos-catalog";
import { setDishAvailability } from "./dish-availability";

export interface SoldOutTarget {
  menuItemId: string;
  name: string;
  reason: string;
}

export interface SoldOutOverride {
  target: SoldOutTarget | null;
  /** The "Sell anyway until end of day" button is offered. */
  canSellAnyway: boolean;
  isSaving: boolean;
  error: string | null;
  open: (target: SoldOutTarget) => void;
  close: () => void;
  sellAnyway: () => Promise<void>;
}

export interface SoldOutOverrideInput {
  /** The account holds `menu` (and is not the read-only demo). */
  canChangeMenu: boolean;
  /** Called once the dish is back on sale — refresh the register's menu. */
  onTurnedOn: (menuItemId: string) => void;
}

/** Whether the override applies to this reason (the dish's own switch). */
export function isDishSwitchReason(reason: string): boolean {
  return reason === DISH_SOLD_OUT_REASON;
}

export function useSoldOutOverride({ canChangeMenu, onTurnedOn }: SoldOutOverrideInput): SoldOutOverride {
  const [target, setTarget] = useState<SoldOutTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((next: SoldOutTarget) => {
    setTarget(next);
    setError(null);
  }, []);
  const close = useCallback(() => {
    setTarget(null);
    setError(null);
  }, []);

  const sellAnyway = useCallback(async () => {
    if (!target || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const first = await setDishAvailability({ menuItemId: target.menuItemId, isAvailable: true });
      const result =
        first.status === "needs_confirmation"
          ? await setDishAvailability({ menuItemId: target.menuItemId, isAvailable: true, sellAnyway: true })
          : first;
      if (result.status !== "saved" || !result.isAvailable) {
        setError("The dish could not be turned back on. Please try again.");
        return;
      }
      setTarget(null);
      onTurnedOn(target.menuItemId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [target, isSaving, onTurnedOn]);

  return {
    target,
    canSellAnyway: Boolean(target) && canChangeMenu && isDishSwitchReason(target?.reason ?? ""),
    isSaving,
    error,
    open,
    close,
    sellAnyway,
  };
}
