import { useCallback, useEffect, useRef } from "react";
import type { ScrollView } from "react-native";

/** Long enough for the iOS keyboard to finish rising before the scroll. */
const KEYBOARD_SETTLE_MS = 300;

/**
 * The kitchen note sits at the bottom of a sheet's ScrollView; on a small
 * phone the keyboard covers it. Focusing it scrolls the sheet to the end once
 * the keyboard is up (the ScrollView also takes
 * `automaticallyAdjustKeyboardInsets`).
 */
export function useScrollNoteIntoView() {
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onNoteFocus = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      scrollRef.current?.scrollToEnd({ animated: true });
    }, KEYBOARD_SETTLE_MS);
  }, []);

  return { scrollRef, onNoteFocus };
}
