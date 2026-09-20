import {
  clamp01,
  FLOOR_ASPECT,
  footprint,
  GRID_STEP,
  mergeMoves,
  nodeFootprint,
  positionAfterDrag,
  snapToGrid,
  suggestNewPosition,
  tidyPositions,
  toCanvas,
  toNormalized,
} from "./floor-layout";
import { nextRotation, normalizeRotation } from "./table-floor";

const CANVAS = { width: 400, height: 400 / FLOOR_ASPECT };

describe("clamp01 and snapToGrid", () => {
  it("keeps a fraction inside the canvas", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it("snaps to the nearest grid line", () => {
    expect(snapToGrid({ x: 0.26, y: 0.512 })).toEqual({ x: 0.25, y: 0.5 });
    expect(snapToGrid({ x: 0.0124, y: 0.0126 })).toEqual({ x: 0, y: GRID_STEP });
  });
});

describe("footprint", () => {
  it("scales with size and keeps a rect twice as wide as tall", () => {
    const sm = footprint("square", "sm", CANVAS);
    const lg = footprint("square", "lg", CANVAS);
    expect(lg.w).toBeGreaterThan(sm.w);
    expect(footprint("round", "md", CANVAS).w).toBe(footprint("round", "md", CANVAS).h);
    const rect = footprint("rect", "md", CANVAS);
    expect(rect.w).toBeCloseTo(rect.h * 2, 5);
  });

  it("derives from the canvas width so the floor draws the same on any phone", () => {
    const narrow = footprint("square", "md", { width: 300, height: 375 });
    const wide = footprint("square", "md", { width: 600, height: 750 });
    expect(wide.w).toBeCloseTo(narrow.w * 2, 5);
  });
});

describe("toCanvas and toNormalized", () => {
  const fp = { w: 80, h: 80 };

  it("places the node so its centre lands on the stored point", () => {
    expect(toCanvas({ x: 0.5, y: 0.5 }, CANVAS, fp)).toEqual({ left: 160, top: 210 });
  });

  it("keeps the node inside the canvas edges", () => {
    expect(toCanvas({ x: 0, y: 0 }, CANVAS, fp)).toEqual({ left: 0, top: 0 });
    expect(toCanvas({ x: 1, y: 1 }, CANVAS, fp)).toEqual({ left: 320, top: 420 });
  });

  it("round-trips a pixel position back to a fraction", () => {
    const px = toCanvas({ x: 0.3, y: 0.7 }, CANVAS, fp);
    const back = toNormalized(px, CANVAS, fp);
    expect(back.x).toBeCloseTo(0.3, 5);
    expect(back.y).toBeCloseTo(0.7, 5);
  });
});

describe("positionAfterDrag", () => {
  const fp = { w: 80, h: 80 };

  it("adds the drag, snaps to the grid and stays inside the floor", () => {
    const moved = positionAfterDrag({ x: 0.5, y: 0.5 }, { dx: 41, dy: -20 }, CANVAS, fp);
    // 41px of 400 is 0.1025 → snaps to 0.1; -20px of 500 is -0.04 → snaps to -0.05.
    expect(moved).toEqual({ x: 0.6, y: 0.45 });
  });

  it("cannot drag a node off the edge", () => {
    const moved = positionAfterDrag({ x: 0.9, y: 0.1 }, { dx: 900, dy: -900 }, CANVAS, fp);
    expect(moved.x).toBeLessThanOrEqual(1);
    expect(moved.y).toBeGreaterThanOrEqual(0);
    const px = toCanvas(moved, CANVAS, fp);
    expect(px.left + fp.w).toBeLessThanOrEqual(CANVAS.width);
    expect(px.top).toBeGreaterThanOrEqual(0);
  });
});

describe("suggestNewPosition", () => {
  it("offers the first free slot on the lattice, reading like a page", () => {
    const first = suggestNewPosition([]);
    const second = suggestNewPosition([first]);
    expect(second.y).toBe(first.y);
    expect(second.x).toBeGreaterThan(first.x);
  });

  it("leaves room for the chairs between one slot and the next", () => {
    const first = suggestNewPosition([]);
    const second = suggestNewPosition([first]);
    const canvas = { width: 400, height: 400 / FLOOR_ASPECT };
    const node = nodeFootprint("square", "lg", canvas, 0);
    const below = suggestNewPosition([first, second, suggestNewPosition([first, second])]);
    expect(Math.abs(second.x - first.x) * canvas.width).toBeGreaterThanOrEqual(node.w);
    expect(Math.abs(below.y - first.y) * canvas.height).toBeGreaterThanOrEqual(node.h);
  });

  it("skips slots that already hold a table", () => {
    const first = suggestNewPosition([]);
    const second = suggestNewPosition([first]);
    const third = suggestNewPosition([first, second]);
    expect(third).not.toEqual(first);
    expect(third).not.toEqual(second);
  });

  it("wraps to the next row and eventually settles for the centre", () => {
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i += 1) placed.push(suggestNewPosition(placed));
    const wrapped = suggestNewPosition(placed);
    expect(wrapped.y).toBeGreaterThan(placed[0].y);

    const full: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i += 1) full.push(suggestNewPosition(full));
    expect(suggestNewPosition(full)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("nodeFootprint", () => {
  const canvas = { width: 400, height: 400 / FLOOR_ASPECT };

  it("is the table top plus the chairs around it", () => {
    const body = footprint("square", "md", canvas);
    const node = nodeFootprint("square", "md", canvas, 0);
    expect(node.w).toBeGreaterThan(body.w);
    expect(node.h).toBeGreaterThan(body.h);
  });

  it("turns on its side when the table is turned a quarter", () => {
    const upright = nodeFootprint("rect", "md", canvas, 0);
    const turned = nodeFootprint("rect", "md", canvas, 90);
    expect(turned.w).toBeCloseTo(upright.h, 5);
    expect(turned.h).toBeCloseTo(upright.w, 5);
    expect(nodeFootprint("rect", "md", canvas, 180)).toEqual(upright);
  });
});

describe("rotation", () => {
  it("turns a quarter at a time and comes back round", () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(270)).toBe(0);
  });

  it("reads anything else off the database as upright", () => {
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation("180")).toBe(180);
    expect(normalizeRotation(45)).toBe(0);
    expect(normalizeRotation(null)).toBe(0);
  });
});

describe("tidyPositions", () => {
  const table = (id: string, posX: number, posY: number) => ({ id, posX, posY });

  it("spreads a crowded floor into rows and columns", () => {
    // Arrange: every table dumped on the same corner
    const tables = [table("a", 0.1, 0.1), table("b", 0.1, 0.1), table("c", 0.1, 0.1)];

    // Act
    const moves = tidyPositions(tables);

    // Assert: one row, evenly spread, in the order given
    expect(moves).toHaveLength(3);
    expect(moves.map((move) => move.id)).toEqual(["a", "b", "c"]);
    expect(moves[0].posX).toBeLessThan(moves[1].posX);
    expect(moves[1].posX).toBeLessThan(moves[2].posX);
    expect(new Set(moves.map((move) => move.posY)).size).toBe(1);
  });

  it("centres a two-top floor rather than hugging a corner", () => {
    const moves = tidyPositions([table("a", 0, 0), table("b", 0, 0)]);
    expect(moves[0].posX + moves[1].posX).toBeCloseTo(1, 5);
    expect(moves[0].posY).toBeCloseTo(0.5, 5);
  });

  it("wraps past the last column onto a new row", () => {
    const tables = Array.from({ length: 7 }, (_, i) => table(String(i), 0, 0));
    const moves = tidyPositions(tables);
    expect(new Set(moves.map((move) => move.posY)).size).toBeGreaterThan(1);
    expect(moves[0].posX).toBeCloseTo(moves[3].posX, 5);
  });

  it("says nothing about a table that is already where it belongs", () => {
    const first = tidyPositions([table("a", 0, 0), table("b", 1, 1)]);
    const settled = first.map((move) => table(move.id, move.posX, move.posY));
    expect(tidyPositions(settled)).toEqual([]);
  });

  it("leaves the floor untouched when there is nothing on it", () => {
    expect(tidyPositions([])).toEqual([]);
  });
});

describe("mergeMoves", () => {
  it("keeps one pending move per table, the latest winning", () => {
    const pending = mergeMoves([{ id: "a", posX: 0.1, posY: 0.1 }], { id: "b", posX: 0.2, posY: 0.2 });
    const updated = mergeMoves(pending, { id: "a", posX: 0.9, posY: 0.9 });
    expect(updated).toEqual([
      { id: "b", posX: 0.2, posY: 0.2 },
      { id: "a", posX: 0.9, posY: 0.9 },
    ]);
  });

  it("returns a new array rather than mutating the pending list", () => {
    const pending = [{ id: "a", posX: 0.1, posY: 0.1 }];
    const next = mergeMoves(pending, { id: "a", posX: 0.5, posY: 0.5 });
    expect(pending).toEqual([{ id: "a", posX: 0.1, posY: 0.1 }]);
    expect(next).not.toBe(pending);
  });
});
