/**
 * Small helpers for the chapter player screen.
 *
 * The player lives on a tab screen, which mounts once and stays mounted, so
 * its step index outlives the chapter it belonged to: opening a three-step
 * chapter while step five of the previous one is still in state renders
 * `chapter.steps[4]` — undefined — before any effect can reset it. The screen
 * resets during the render that first sees a new chapter id; this clamp keeps
 * the lookup in range whatever else moves (a hot reload, an edited chapter).
 */

/** An index the chapter actually has, given how many steps it holds. */
export function clampStepIndex(stepCount: number, index: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(index, 0), stepCount - 1);
}
