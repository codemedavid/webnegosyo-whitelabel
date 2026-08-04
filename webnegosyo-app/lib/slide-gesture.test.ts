/**
 * The confirmation-gesture threshold.
 *
 * This control guards two writes that are awkward to undo, so "how far is far
 * enough" is worth pinning down: too low and a thumb brushing the screen
 * releases someone's order, too high and staff cannot complete it one-handed.
 */

import { isSlideComplete, SLIDE_COMPLETE_THRESHOLD } from "./slide-gesture";

const TRACK = 200;

describe("isSlideComplete", () => {
  it("completes at the far end of the track", () => {
    expect(isSlideComplete(TRACK, TRACK)).toBe(true);
  });

  it("completes at exactly the threshold", () => {
    expect(isSlideComplete(TRACK * SLIDE_COMPLETE_THRESHOLD, TRACK)).toBe(true);
  });

  it("does not complete just short of the threshold", () => {
    expect(isSlideComplete(TRACK * SLIDE_COMPLETE_THRESHOLD - 1, TRACK)).toBe(false);
  });

  it("does not complete on a small accidental drag", () => {
    expect(isSlideComplete(12, TRACK)).toBe(false);
  });

  it("clamps a drag past the end rather than overflowing", () => {
    expect(isSlideComplete(TRACK * 3, TRACK)).toBe(true);
  });

  it("ignores a backwards drag", () => {
    expect(isSlideComplete(-TRACK, TRACK)).toBe(false);
  });

  it("never completes before the track has been measured", () => {
    // maxSlide is 0 on the first render, when trackWidth is still unknown.
    // Completing here would fire the action on any touch.
    expect(isSlideComplete(500, 0)).toBe(false);
  });
});
