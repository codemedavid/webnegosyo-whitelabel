import { useEffect, useState } from "react";

/** True once `delayMs` has passed since mount (at once with Reduce Motion). */
export function useAfter(delayMs: number, isReducedMotion: boolean): boolean {
  const [hasPassed, setHasPassed] = useState(isReducedMotion);

  useEffect(() => {
    if (isReducedMotion) {
      setHasPassed(true);
      return;
    }
    const timer = setTimeout(() => setHasPassed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, isReducedMotion]);

  return hasPassed;
}
