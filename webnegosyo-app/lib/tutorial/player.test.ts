/**
 * The player's index arithmetic. A tab screen stays mounted, so the step index
 * of the chapter just left is still in state when the next chapter renders —
 * a six-step chapter followed by a three-step one crashed the screen on
 * `chapter.steps[stepIndex].id`. Clamping is the last line of defence.
 */

import { clampStepIndex } from "./player";

describe("clampStepIndex", () => {
  it("keeps an index that the chapter actually has", () => {
    expect(clampStepIndex(6, 4)).toBe(4);
  });

  it("clamps an index left over from a longer chapter to the last step", () => {
    // Arrange: the merchant was on step 5 of a six-step chapter.
    const carriedOver = 4;

    // Act: the next chapter has three steps.
    const index = clampStepIndex(3, carriedOver);

    // Assert
    expect(index).toBe(2);
  });

  it("never returns a negative index", () => {
    expect(clampStepIndex(3, -1)).toBe(0);
  });

  it("returns 0 for a chapter with no steps", () => {
    expect(clampStepIndex(0, 3)).toBe(0);
  });
});
