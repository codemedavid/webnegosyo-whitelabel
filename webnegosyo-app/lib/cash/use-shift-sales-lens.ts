/**
 * The Shift sales screen's lens, kept in step with how it was opened. The
 * screen stays mounted between visits, so choosing the lens once on mount
 * left a later `?lens=mine` (End shift, My shifts) or an account that lost
 * Reports on the old lens. It is re-derived (`initialLens`) on every focus
 * and whenever the param or the account's access changes; a lens picked on
 * the screen holds until then.
 */

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { initialLens, type ShiftSalesLensKey } from "./shift-sales-lens";

export function useShiftSalesLens(input: {
  param: string | undefined;
  canSeeStore: boolean;
}): [ShiftSalesLensKey, (next: ShiftSalesLensKey) => void] {
  const { param, canSeeStore } = input;
  const [lens, setLens] = useState<ShiftSalesLensKey>(() => initialLens({ param, canSeeStore }));

  useFocusEffect(
    useCallback(() => {
      setLens(initialLens({ param, canSeeStore }));
    }, [param, canSeeStore]),
  );

  return [lens, setLens];
}
