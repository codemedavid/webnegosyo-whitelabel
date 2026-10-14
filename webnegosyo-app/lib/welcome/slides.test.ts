import {
  WELCOME_SLIDES,
  nextSlideIndex,
  slideIndexAfterSwipe,
  SWIPE_THRESHOLD_PX,
} from "./slides";

describe("welcome slides", () => {
  it("tells three results, each with its own panel colour", () => {
    expect(WELCOME_SLIDES.map((s) => s.id)).toEqual(["orders", "loyalty", "sales"]);
    expect(new Set(WELCOME_SLIDES.map((s) => s.panelColor)).size).toBe(3);
  });

  it("never invites a sign-up (Apple 3.1.1: sign-in and the demo only)", () => {
    const copy = WELCOME_SLIDES.map((s) => `${s.headline} ${s.body}`).join(" ");
    expect(copy).not.toMatch(/sign ?up|register|create your store/i);
  });

  it("autoplay wraps from the last screen back to the first", () => {
    expect(nextSlideIndex(0, 3)).toBe(1);
    expect(nextSlideIndex(2, 3)).toBe(0);
  });

  it("a left swipe shows the next screen and a right swipe the previous", () => {
    expect(slideIndexAfterSwipe(0, -SWIPE_THRESHOLD_PX - 1, 3)).toBe(1);
    expect(slideIndexAfterSwipe(1, SWIPE_THRESHOLD_PX + 1, 3)).toBe(0);
  });

  it("a short drag changes nothing", () => {
    expect(slideIndexAfterSwipe(1, SWIPE_THRESHOLD_PX - 1, 3)).toBe(1);
    expect(slideIndexAfterSwipe(1, -(SWIPE_THRESHOLD_PX - 1), 3)).toBe(1);
  });

  it("a swipe stops at either end instead of wrapping", () => {
    expect(slideIndexAfterSwipe(0, SWIPE_THRESHOLD_PX + 1, 3)).toBe(0);
    expect(slideIndexAfterSwipe(2, -SWIPE_THRESHOLD_PX - 1, 3)).toBe(2);
  });
});
