import {
  POS_PANEL_MAX_WIDTH,
  POS_PANEL_MIN_WIDTH,
  POS_PHONE_COLUMNS,
  isPosDialogCentered,
  resolvePosLayout,
} from "./pos-layout";

const IPHONE_16_PORTRAIT = { width: 393, height: 852 };
const IPHONE_SE_PORTRAIT = { width: 320, height: 568 };
const IPHONE_16_PRO_MAX_LANDSCAPE = { width: 956, height: 440 };
const IPAD_MINI_PORTRAIT = { width: 744, height: 1133 };
const IPAD_11_PORTRAIT = { width: 820, height: 1180 };
const IPAD_11_LANDSCAPE = { width: 1180, height: 820 };
const IPAD_PRO_13_LANDSCAPE = { width: 1366, height: 1024 };
const ANDROID_TABLET_LANDSCAPE = { width: 1024, height: 640 };

describe("resolvePosLayout on a phone", () => {
  it("keeps the sale as a bottom sheet", () => {
    expect(resolvePosLayout(IPHONE_16_PORTRAIT).isTwoPane).toBe(false);
    expect(resolvePosLayout(IPHONE_16_PORTRAIT).panelWidth).toBe(0);
  });

  it("keeps the three-column grid it has always had", () => {
    expect(resolvePosLayout(IPHONE_16_PORTRAIT).columns).toBe(POS_PHONE_COLUMNS);
    expect(resolvePosLayout(IPHONE_SE_PORTRAIT).columns).toBe(POS_PHONE_COLUMNS);
  });

  it("does not open a second pane on a wide phone lying on its side", () => {
    // Wider than an iPad mini, but only 440pt tall — a sale column here would
    // leave the grid two rows deep.
    expect(resolvePosLayout(IPHONE_16_PRO_MAX_LANDSCAPE).isTwoPane).toBe(false);
  });
});

describe("resolvePosLayout on a tablet", () => {
  it("gives the sale its own column, upright or sideways", () => {
    expect(resolvePosLayout(IPAD_MINI_PORTRAIT).isTwoPane).toBe(true);
    expect(resolvePosLayout(IPAD_11_LANDSCAPE).isTwoPane).toBe(true);
    expect(resolvePosLayout(ANDROID_TABLET_LANDSCAPE).isTwoPane).toBe(true);
  });

  it("keeps the panel between its bounds at every size", () => {
    for (const size of [
      IPAD_MINI_PORTRAIT,
      IPAD_11_PORTRAIT,
      IPAD_11_LANDSCAPE,
      IPAD_PRO_13_LANDSCAPE,
      ANDROID_TABLET_LANDSCAPE,
    ]) {
      const { panelWidth } = resolvePosLayout(size);
      expect(panelWidth).toBeGreaterThanOrEqual(POS_PANEL_MIN_WIDTH);
      expect(panelWidth).toBeLessThanOrEqual(POS_PANEL_MAX_WIDTH);
    }
  });

  it("widens the panel as the window widens, up to the cap", () => {
    expect(resolvePosLayout(IPAD_MINI_PORTRAIT).panelWidth).toBe(POS_PANEL_MIN_WIDTH);
    expect(resolvePosLayout(IPAD_11_LANDSCAPE).panelWidth).toBe(401);
    expect(resolvePosLayout(IPAD_PRO_13_LANDSCAPE).panelWidth).toBe(POS_PANEL_MAX_WIDTH);
  });

  it("spends the extra width on more tiles per row, never fewer than a phone", () => {
    expect(resolvePosLayout(IPAD_MINI_PORTRAIT).columns).toBeGreaterThanOrEqual(
      POS_PHONE_COLUMNS,
    );
    expect(resolvePosLayout(IPAD_11_PORTRAIT).columns).toBe(4);
    expect(resolvePosLayout(IPAD_11_LANDSCAPE).columns).toBe(5);
    expect(resolvePosLayout(IPAD_PRO_13_LANDSCAPE).columns).toBe(6);
  });

  it("never leaves the grid narrower than the panel beside it", () => {
    for (const size of [IPAD_MINI_PORTRAIT, IPAD_11_PORTRAIT, IPAD_11_LANDSCAPE]) {
      const { panelWidth } = resolvePosLayout(size);
      expect(size.width - panelWidth).toBeGreaterThan(panelWidth);
    }
  });

  it("collapses back to the phone register in a narrow split-screen slot", () => {
    // An iPad in a 1/3 split: tablet-tall, phone-wide.
    expect(resolvePosLayout({ width: 375, height: 1180 }).isTwoPane).toBe(false);
  });
});

describe("isPosDialogCentered", () => {
  it("leaves a phone's sheets docked to the bottom, where the thumb is", () => {
    expect(isPosDialogCentered(IPHONE_16_PORTRAIT)).toBe(false);
    expect(isPosDialogCentered(IPHONE_SE_PORTRAIT)).toBe(false);
  });

  it("centres them on a tablet, rather than stretching one row across the glass", () => {
    expect(isPosDialogCentered(IPAD_MINI_PORTRAIT)).toBe(true);
    expect(isPosDialogCentered(IPAD_PRO_13_LANDSCAPE)).toBe(true);
  });

  it("agrees with the two-pane decision, so the register changes shape once", () => {
    for (const size of [
      IPHONE_16_PORTRAIT,
      IPHONE_16_PRO_MAX_LANDSCAPE,
      IPAD_MINI_PORTRAIT,
      IPAD_11_LANDSCAPE,
      IPAD_PRO_13_LANDSCAPE,
    ]) {
      expect(isPosDialogCentered(size)).toBe(resolvePosLayout(size).isTwoPane);
    }
  });
});
