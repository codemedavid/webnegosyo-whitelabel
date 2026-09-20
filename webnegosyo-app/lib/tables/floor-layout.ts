/**
 * Geometry of the floor canvas. A table's position is stored as the fraction
 * of the canvas its CENTRE sits at (0..1 on each axis), so one floor draws the
 * same on a phone, a tablet and a future web page. Everything here converts
 * between that fraction and the pixels a given canvas actually has.
 *
 * Pure: no React Native imports, so the drag maths is testable to the pixel.
 */

import { furnitureExtent, type TableBody } from "./table-furniture";
import type { Rotation, TableShape, TableSize } from "./table-floor";

export interface CanvasSize {
  width: number;
  height: number;
}

export interface NormPoint {
  x: number;
  y: number;
}

/** Where a table stands right now: its point and the turn it is set at. */
export interface TablePlacement extends NormPoint {
  rotation: Rotation;
}

export interface Footprint {
  w: number;
  h: number;
}

export interface PixelPoint {
  left: number;
  top: number;
}

export interface PositionMove {
  id: string;
  posX: number;
  posY: number;
  /** Set only when the move turned the table; absent leaves it as it was. */
  rotation?: Rotation;
}

/** Width over height. A portrait canvas fits a phone; the width is the phone's. */
export const FLOOR_ASPECT = 4 / 5;

/** Drags snap to this fraction of the canvas: 40 columns across. */
export const GRID_STEP = 0.025;

/**
 * A medium square TOP is this fraction of the canvas width. The node itself
 * is wider — the chairs pull in around the top — so these are smaller than
 * the plain tiles they replaced, and the lattice below is wider to match.
 */
const SIZE_FRACTION: Record<TableSize, number> = { sm: 0.115, md: 0.145, lg: 0.17 };


export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundTo(value: number, step: number): number {
  // Rounding through an integer count of steps avoids 0.1 + 0.2 style drift.
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function snapToGrid(point: NormPoint, step: number = GRID_STEP): NormPoint {
  return { x: roundTo(point.x, step), y: roundTo(point.y, step) };
}

export function footprint(shape: TableShape, size: TableSize, canvas: CanvasSize): Footprint {
  const edge = canvas.width * SIZE_FRACTION[size];
  if (shape === "rect") return { w: edge * 1.5, h: edge * 0.75 };
  return { w: edge, h: edge };
}

/** Top-left pixel of a node whose centre is at `point`, kept inside the canvas. */
/**
 * The space a table actually takes on the floor: its top, its chairs, and
 * the quarter turn it is set at. This — not the bare top — is what a drag
 * is clamped by, so a turned long table cannot be pushed through a wall.
 */
export function nodeFootprint(
  shape: TableShape,
  size: TableSize,
  canvas: CanvasSize,
  rotation: Rotation,
): Footprint {
  const extent = furnitureExtent(footprint(shape, size, canvas) as TableBody);
  return rotation === 90 || rotation === 270 ? { w: extent.h, h: extent.w } : extent;
}

export function toCanvas(point: NormPoint, canvas: CanvasSize, fp: Footprint): PixelPoint {
  const left = clamp01(point.x) * canvas.width - fp.w / 2;
  const top = clamp01(point.y) * canvas.height - fp.h / 2;
  return {
    left: Math.min(Math.max(0, left), Math.max(0, canvas.width - fp.w)),
    top: Math.min(Math.max(0, top), Math.max(0, canvas.height - fp.h)),
  };
}

export function toNormalized(pixel: PixelPoint, canvas: CanvasSize, fp: Footprint): NormPoint {
  return {
    x: clamp01((pixel.left + fp.w / 2) / canvas.width),
    y: clamp01((pixel.top + fp.h / 2) / canvas.height),
  };
}

/** Where a node lands after a drag: origin plus translation, snapped, inside. */
export function positionAfterDrag(
  origin: NormPoint,
  translation: { dx: number; dy: number },
  canvas: CanvasSize,
  fp: Footprint,
): NormPoint {
  const start = toCanvas(origin, canvas, fp);
  const moved = toNormalized(
    { left: start.left + translation.dx, top: start.top + translation.dy },
    canvas,
    fp,
  );
  // Re-run through toCanvas so a snap cannot push the node's edge back out.
  const snapped = snapToGrid(moved);
  return toNormalized(toCanvas(snapped, canvas, fp), canvas, fp);
}

// Three across, three down, spaced so even the largest table's chairs clear
// its neighbour's on both axes. Past the ninth table the centre is offered
// and the merchant drags it where the room actually puts it.
const LATTICE_XS = [0.17, 0.5, 0.83];
const LATTICE_YS = [0.17, 0.5, 0.83];
const SLOT_TOLERANCE = 0.09;
const CENTRE: NormPoint = { x: 0.5, y: 0.5 };

/** The first lattice slot no existing table sits near; the centre once full. */
export function suggestNewPosition(existing: readonly NormPoint[]): NormPoint {
  for (const y of LATTICE_YS) {
    for (const x of LATTICE_XS) {
      const isTaken = existing.some(
        (point) => Math.abs(point.x - x) < SLOT_TOLERANCE && Math.abs(point.y - y) < SLOT_TOLERANCE,
      );
      if (!isTaken) return { x, y };
    }
  }
  return CENTRE;
}

/** Columns a tidy-up lays the floor out in; rows follow from the count. */
const TIDY_COLUMNS = 3;

export interface PositionedTable {
  id: string;
  posX: number;
  posY: number;
}

/**
 * Every table laid out on an even grid, in the order given — the way a
 * merchant starts a floor before dragging it into the shape of their room.
 * Tables already on their slot are left out, so a tidy-up of a tidy floor
 * writes nothing.
 */
export function tidyPositions(tables: readonly PositionedTable[]): PositionMove[] {
  if (tables.length === 0) return [];
  const columns = Math.min(TIDY_COLUMNS, tables.length);
  const rows = Math.ceil(tables.length / columns);

  return tables
    .map((table, index) => ({
      id: table.id,
      posX: Number((((index % columns) + 0.5) / columns).toFixed(6)),
      posY: Number(((Math.floor(index / columns) + 0.5) / rows).toFixed(6)),
    }))
    .filter((move, index) => move.posX !== tables[index].posX || move.posY !== tables[index].posY);
}

/** One pending move per table; a later drag of the same table replaces the earlier. */
export function mergeMoves(
  pending: readonly PositionMove[],
  move: PositionMove,
): PositionMove[] {
  return [...pending.filter((entry) => entry.id !== move.id), move];
}
