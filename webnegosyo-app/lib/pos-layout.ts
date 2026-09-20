/**
 * How the register arranges itself for the glass it is running on.
 *
 * A phone register is one column: the product grid owns the screen and the
 * running sale is a sheet docked to the bottom, collapsed until it is needed.
 * That is the right shape for 390pt of width and the wrong one for a tablet on
 * a counter stand, where the sale ends up as a letterbox strip under a grid
 * that still only fits three tiles across.
 *
 * On a tablet the two halves stand side by side instead: products on the left,
 * the sale stacked down a permanent panel on the right, with more tiles per row
 * because there is width to spend. Nothing about the sale's LOGIC changes —
 * this module only answers "how wide" and "how many across".
 */

import { isTabletScreen, type ScreenSize } from "./screen-size";

/**
 * Window width, in dp/pt, at or above which the sale gets its own column.
 *
 * Matched to the narrowest tablet in portrait (an iPad mini is 744pt) so that
 * standing a tablet upright does not drop the register back to a phone layout
 * — the panel narrows instead. No phone reaches it, in either orientation,
 * because the two-pane check also requires a tablet-sized short side.
 */
export const POS_TWO_PANE_MIN_WIDTH = 700;

/** The sale panel never gets narrower than this; below it, rows stop fitting. */
export const POS_PANEL_MIN_WIDTH = 320;

/** …nor wider than this: past it the panel is just padding around a total. */
export const POS_PANEL_MAX_WIDTH = 420;

/** Share of the window the sale panel asks for, between those two bounds. */
const POS_PANEL_WIDTH_RATIO = 0.34;

/** Tiles per row, by the width left over for the grid after the panel. */
const COLUMN_BREAKPOINTS: readonly { minWidth: number; columns: number }[] = [
  { minWidth: 900, columns: 6 },
  { minWidth: 720, columns: 5 },
  { minWidth: 460, columns: 4 },
];

/** What a phone has always shown, and the floor for anything narrower. */
export const POS_PHONE_COLUMNS = 3;

/**
 * Width a register dialog stops growing at.
 *
 * A bottom sheet that spans a 1366pt tablet puts the option name at one edge
 * of the glass and its price at the other, and asks the cashier to track
 * across the whole counter to read one row. Past this width the sheet becomes
 * a centred dialog of roughly phone proportions instead.
 */
export const POS_DIALOG_MAX_WIDTH = 560;

/**
 * True when a register dialog should centre itself rather than dock bottom.
 *
 * Deliberately the SAME condition as the two-pane grid below, so the register
 * changes shape exactly once: there is no size at which the sale is a bottom
 * sheet but the modifier picker is a centred dialog.
 */
export function isPosDialogCentered(size: ScreenSize): boolean {
  return resolvePosLayout(size).isTwoPane;
}

export interface PosLayout {
  /** True when the sale is a column beside the grid rather than a bottom sheet. */
  isTwoPane: boolean;
  /** Width of the sale column. Zero when the sale is a bottom sheet. */
  panelWidth: number;
  /** Product tiles per grid row. */
  columns: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function columnsForGridWidth(gridWidth: number): number {
  const match = COLUMN_BREAKPOINTS.find(({ minWidth }) => gridWidth >= minWidth);
  return match ? match.columns : POS_PHONE_COLUMNS;
}

/**
 * The register's shape for one window size.
 *
 * Pure and width-driven rather than device-driven, so a tablet dropped into a
 * split-screen slot collapses to the phone register instead of trying to hold
 * two panes in half the glass.
 */
export function resolvePosLayout(size: ScreenSize): PosLayout {
  const isTwoPane = isTabletScreen(size) && size.width >= POS_TWO_PANE_MIN_WIDTH;
  if (!isTwoPane) {
    return {
      isTwoPane: false,
      panelWidth: 0,
      columns: columnsForGridWidth(size.width),
    };
  }

  const panelWidth = Math.round(
    clamp(size.width * POS_PANEL_WIDTH_RATIO, POS_PANEL_MIN_WIDTH, POS_PANEL_MAX_WIDTH),
  );
  return { isTwoPane: true, panelWidth, columns: columnsForGridWidth(size.width - panelWidth) };
}
