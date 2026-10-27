import React from "react";

import type { KeypadKey } from "../../lib/expenses/keypad";
import { Keypad } from "../Keypad";

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

interface ExpenseKeypadProps {
  onKey: (key: KeypadKey) => void;
  keyHeight?: number;
  isDisabled?: boolean;
}

/**
 * Our own number pad (plan §5.1): the OS keyboard covers half the sheet and
 * changes shape between phones; this one is always in the same place under
 * the cashier's thumb. Long-press `00` for centavos, long-press delete to clear.
 *
 * It is the shared Keypad in amount mode (components/Keypad.tsx): same keys,
 * labels, test ids and long-presses, and disabled keys keep their full colour
 * as they always have here.
 */
export function ExpenseKeypad({ onKey, keyHeight = KEY_HEIGHT, isDisabled = false }: ExpenseKeypadProps) {
  return (
    <Keypad
      mode="amount"
      onKey={(key) => {
        if (key !== "next") onKey(key);
      }}
      keyHeight={keyHeight}
      isDisabled={isDisabled}
      shouldDimWhenDisabled={false}
    />
  );
}
