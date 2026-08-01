import { useEffect, useState } from "react";

/** Long enough to swallow a fast typist's burst, short enough to feel immediate. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * A copy of `value` that settles after `delayMs` of quiet.
 *
 * This exists to split one input into two speeds. A text box must repaint on
 * the keystroke or the caret visibly trails the finger, but the work the text
 * box triggers — here, two full passes over every line item the store has ever
 * sold — must not run at that rate. The raw value stays on the input; the
 * expensive reader takes this one.
 *
 * The pending timer is cleared on every change, so a burst of keystrokes
 * queues exactly one recompute rather than one per character.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // Nothing pending and nothing to change: skip the timer entirely so an
    // unrelated re-render does not schedule needless work.
    if (Object.is(settled, value)) return;

    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
    // `settled` is deliberately absent: including it would restart the timer
    // when the value lands, scheduling a second no-op pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return settled;
}
