import {
  TABLET_MIN_SHORT_SIDE,
  isTabletScreen,
  orientationLockFor,
  shortSide,
} from "./screen-size";

/** Real windows, in the units the platforms report. */
const IPHONE_16_PORTRAIT = { width: 393, height: 852 };
const IPHONE_16_PRO_MAX_LANDSCAPE = { width: 956, height: 440 };
const IPAD_MINI_PORTRAIT = { width: 744, height: 1133 };
const IPAD_11_LANDSCAPE = { width: 1180, height: 820 };
const ANDROID_TABLET_LANDSCAPE = { width: 1024, height: 640 };

describe("shortSide", () => {
  it("is the same number whichever way the device is held", () => {
    expect(shortSide(IPAD_11_LANDSCAPE)).toBe(820);
    expect(shortSide({ width: 820, height: 1180 })).toBe(820);
  });
});

describe("isTabletScreen", () => {
  it("calls every iPad a tablet, in either orientation", () => {
    expect(isTabletScreen(IPAD_MINI_PORTRAIT)).toBe(true);
    expect(isTabletScreen(IPAD_11_LANDSCAPE)).toBe(true);
  });

  it("calls Android tablets tablets", () => {
    expect(isTabletScreen(ANDROID_TABLET_LANDSCAPE)).toBe(true);
  });

  it("does not call a phone a tablet just because it is lying on its side", () => {
    expect(isTabletScreen(IPHONE_16_PORTRAIT)).toBe(false);
    // 956pt wide — wider than an iPad mini — but only 440pt tall.
    expect(isTabletScreen(IPHONE_16_PRO_MAX_LANDSCAPE)).toBe(false);
  });

  it("treats the sw600dp boundary as inclusive", () => {
    expect(isTabletScreen({ width: TABLET_MIN_SHORT_SIDE, height: 900 })).toBe(true);
    expect(isTabletScreen({ width: TABLET_MIN_SHORT_SIDE - 1, height: 900 })).toBe(false);
  });
});

describe("orientationLockFor", () => {
  it("turns a tablet sideways, however it is being held right now", () => {
    // The portrait iPad is the case that matters: a tablet picked up upright
    // must still end up in the landscape the register is drawn for.
    expect(orientationLockFor(IPAD_MINI_PORTRAIT)).toBe("landscape");
    expect(orientationLockFor(ANDROID_TABLET_LANDSCAPE)).toBe("landscape");
  });

  it("keeps a handset upright", () => {
    expect(orientationLockFor(IPHONE_16_PORTRAIT)).toBe("portrait");
  });

  it("does not unlock a phone that is already sideways", () => {
    expect(orientationLockFor(IPHONE_16_PRO_MAX_LANDSCAPE)).toBe("portrait");
  });
});
