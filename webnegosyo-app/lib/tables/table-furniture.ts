/**
 * Where the chairs go. A host reads a floor the way they read the room —
 * furniture, not tiles — so a table is drawn as a top with chairs around it,
 * and the chairs are where a server would actually put them: down the long
 * sides of a banquette table, one to a side on a four-top, evenly ringed on
 * a round one.
 *
 * Everything here is pixels RELATIVE TO THE TABLE TOP'S CENTRE, unrotated.
 * The node applies the table's own rotation to the whole group, so this
 * never has to know which way the table faces.
 *
 * Pure: no React, no react-native — the geometry is testable to the pixel.
 */

import type { TableShape } from "./table-floor";

/** The table top itself, in pixels. */
export interface TableBody {
  w: number;
  h: number;
}

export interface SeatSlot {
  /** Chair centre, relative to the table top's centre. */
  x: number;
  y: number;
  /** Degrees clockwise. 0 faces the table from above it, 90 from its right. */
  angle: number;
  /** Across the chair (shoulder to shoulder). */
  w: number;
  /** Front to back. */
  d: number;
  /** Seat number, so a party of three fills chairs 0, 1 and 2. */
  index: number;
}

export interface ChairMetrics {
  /** Front-to-back depth of a chair. */
  depth: number;
  /** Widest a chair is ever drawn; a crowded side trims from this. */
  maxWidth: number;
  /** Between the table's edge and the chair's back. */
  gap: number;
}

/**
 * Past this, chairs stop being furniture and become noise — a twenty-seat
 * banquet draws its first dozen and lets the seat count say the rest.
 */
export const MAX_DRAWN_SEATS = 12;

const DEPTH_OF_BODY = 0.3;
const DEPTH_MIN = 8;
const DEPTH_MAX = 22;
const WIDTH_OF_DEPTH = 1.4;
const GAP_OF_DEPTH = 0.3;
const GAP_MIN = 2.5;
/** How much of the space a chair gets it actually fills; the rest is elbow room. */
const CROWDING = 0.82;
const MIN_CHAIR_WIDTH = 5;

type Side = "top" | "bottom" | "left" | "right";

const SIDE_ORDER: readonly Side[] = ["top", "bottom", "left", "right"];
const SIDE_ANGLE: Record<Side, number> = { top: 0, bottom: 180, left: 270, right: 90 };

export type SideSeatCounts = Record<Side, number>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chairMetrics(body: TableBody): ChairMetrics {
  const depth = clamp(Math.min(body.w, body.h) * DEPTH_OF_BODY, DEPTH_MIN, DEPTH_MAX);
  return {
    depth,
    maxWidth: depth * WIDTH_OF_DEPTH,
    gap: Math.max(GAP_MIN, depth * GAP_OF_DEPTH),
  };
}

/** The node a table occupies once its chairs are pulled in around it. */
export function furnitureExtent(body: TableBody): TableBody {
  const chair = chairMetrics(body);
  const margin = 2 * (chair.depth + chair.gap);
  return { w: body.w + margin, h: body.h + margin };
}

/**
 * How many chairs go on each side. Each seat is given to whichever side would
 * then still have the most room per chair, so a long table fills its long
 * sides first and a square one goes round evenly.
 */
export function sideSeatCounts(body: TableBody, seats: number): SideSeatCounts {
  const length: Record<Side, number> = { top: body.w, bottom: body.w, left: body.h, right: body.h };
  const counts: SideSeatCounts = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let seat = 0; seat < Math.max(0, seats); seat += 1) {
    let best: Side = SIDE_ORDER[0];
    let bestRoom = -1;
    for (const side of SIDE_ORDER) {
      const room = length[side] / (counts[side] + 1);
      // Strictly greater, so a tie keeps the reading order: top, bottom, then ends.
      if (room > bestRoom + 1e-9) {
        bestRoom = room;
        best = side;
      }
    }
    counts[best] += 1;
  }
  return counts;
}

function chairWidth(spacing: number, max: number): number {
  return Math.max(MIN_CHAIR_WIDTH, Math.min(max, spacing * CROWDING));
}

function roundSlots(body: TableBody, seats: number): SeatSlot[] {
  const chair = chairMetrics(body);
  const radius = Math.max(body.w, body.h) / 2 + chair.gap + chair.depth / 2;
  const step = 360 / seats;
  const arcSpacing = (2 * Math.PI * radius) / seats;
  const w = chairWidth(arcSpacing, chair.maxWidth);

  return Array.from({ length: seats }, (_, index) => {
    const angle = index * step;
    const radians = (angle * Math.PI) / 180;
    return {
      x: radius * Math.sin(radians),
      y: -radius * Math.cos(radians),
      angle,
      w,
      d: chair.depth,
      index,
    };
  });
}

function sideSlots(body: TableBody, seats: number): SeatSlot[] {
  const chair = chairMetrics(body);
  const counts = sideSeatCounts(body, seats);
  const offsetX = body.w / 2 + chair.gap + chair.depth / 2;
  const offsetY = body.h / 2 + chair.gap + chair.depth / 2;
  const slots: SeatSlot[] = [];
  let index = 0;

  for (const side of SIDE_ORDER) {
    const count = counts[side];
    if (count === 0) continue;
    const isHorizontal = side === "top" || side === "bottom";
    const along = isHorizontal ? body.w : body.h;
    const spacing = along / (count + 1);
    const w = chairWidth(spacing, chair.maxWidth);

    for (let seat = 0; seat < count; seat += 1) {
      const centre = -along / 2 + spacing * (seat + 1);
      slots.push({
        x: isHorizontal ? centre : side === "left" ? -offsetX : offsetX,
        y: isHorizontal ? (side === "top" ? -offsetY : offsetY) : centre,
        angle: SIDE_ANGLE[side],
        w,
        d: chair.depth,
        index,
      });
      index += 1;
    }
  }
  return slots;
}

/** Every chair around a table, in the order a party fills them. */
export function seatSlots(shape: TableShape, seats: number, body: TableBody): SeatSlot[] {
  const drawn = Math.min(Math.max(0, Math.floor(seats)), MAX_DRAWN_SEATS);
  if (drawn === 0) return [];
  return shape === "round" ? roundSlots(body, drawn) : sideSlots(body, drawn);
}
