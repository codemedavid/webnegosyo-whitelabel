import { useCallback, useEffect, useRef } from "react";
import type { ScrollView } from "react-native";

/** Long enough for the iOS keyboard to finish rising before the scroll. */
const KEYBOARD_SETTLE_MS = 300;

/**
 * The option picker's kitchen note is the LAST thing in a long ScrollView.
 * The sheet's KeyboardAvoidingView lifts it (the one keyboard mechanism) and
 * shrinks the scroll area, so focusing the note scrolls to the end of the real
 * content once the keyboard is up. Never pair this with
 * `automaticallyAdjustKeyboardInsets`: the extra inset made "the end" a
 * keyboard-height of blank space and the note scrolled up behind the header.
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
