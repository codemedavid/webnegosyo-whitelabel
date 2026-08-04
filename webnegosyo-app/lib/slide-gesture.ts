/**
 * The confirmation-gesture threshold for components/SlideAction.tsx.
 *
 * Lives in lib/ because that is what the test runner roots, and because the
 * rule it encodes — how far a drag must travel to count as deliberate —
 * guards writes that are awkward to undo: accepting an order into the queue,
 * and confirming a customer has collected their food.
 */

/** Fraction of the track a drag must cover to confirm. */
export const SLIDE_COMPLETE_THRESHOLD = 0.85;

/**
 * Whether releasing at `dx` on a track of `maxSlide` confirms the action.
 *
 * Returns false when `maxSlide` is 0 — that is the state before the track has
 * been measured, where completing would fire on any touch.
 */
export function isSlideComplete(dx: number, maxSlide: number): boolean {
  if (maxSlide <= 0) return false;
  const x = Math.min(Math.max(0, dx), maxSlide);
  return x >= maxSlide * SLIDE_COMPLETE_THRESHOLD;
}
