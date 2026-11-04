import { useCallback, useEffect, useRef } from "react";

/** Holding + / − repeats after this long… (06 §5) */
export const HOLD_DELAY_MS = 400;
/** …every this often. */
export const HOLD_INTERVAL_MS = 120;

interface HoldHandlers {
  onPressIn: () => void;
  onPressOut: () => void;
}

/**
 * Press-and-hold repeat for a stepper, with plain timers (no reanimated, no
 * gesture handler: this app ships over the air). The first step fires on
 * press-in so a single tap is one step; holding adds one every 120 ms after a
 * 400 ms wait; release, unmount or disabling stops it.
 */
export function useHoldRepeat(onStep: () => void, isDisabled = false): HoldHandlers {
  const stepRef = useRef(onStep);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stepRef.current = onStep;
  }, [onStep]);

  const stop = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (repeatRef.current) clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (isDisabled) stop();
  }, [isDisabled, stop]);

  const onPressIn = useCallback(() => {
    if (isDisabled) return;
    stop();
    stepRef.current();
    delayRef.current = setTimeout(() => {
      repeatRef.current = setInterval(() => stepRef.current(), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }, [isDisabled, stop]);

  return { onPressIn, onPressOut: stop };
}
