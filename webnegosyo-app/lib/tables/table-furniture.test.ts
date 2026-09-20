import {
  chairMetrics,
  furnitureExtent,
  MAX_DRAWN_SEATS,
  seatSlots,
  sideSeatCounts,
} from "./table-furniture";

const SQUARE = { w: 80, h: 80 };
const LONG = { w: 120, h: 60 };

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("sideSeatCounts", () => {
  it("puts one chair on each side of a four-top", () => {
    // Arrange / Act
    const counts = sideSeatCounts(SQUARE, 4);

    // Assert
    expect(counts).toEqual({ top: 1, bottom: 1, left: 1, right: 1 });
  });

  it("seats a long table down its long sides first", () => {
    expect(sideSeatCounts(LONG, 6)).toEqual({ top: 2, bottom: 2, left: 1, right: 1 });
  });

  it("sits a two-top across from itself, not cornered", () => {
    expect(sideSeatCounts(LONG, 2)).toEqual({ top: 1, bottom: 1, left: 0, right: 0 });
  });

  it("keeps the long sides ahead as the party grows", () => {
    const counts = sideSeatCounts(LONG, 10);
    expect(counts.top).toBe(counts.bottom);
    expect(counts.top).toBeGreaterThan(counts.left);
    expect(counts.top + counts.bottom + counts.left + counts.right).toBe(10);
  });
});

describe("seatSlots", () => {
  it("draws nothing for a table with no seats", () => {
    expect(seatSlots("square", 0, SQUARE)).toEqual([]);
    expect(seatSlots("round", -3, SQUARE)).toEqual([]);
  });

  it("rings a round table evenly, starting at the top", () => {
    // Arrange / Act
    const slots = seatSlots("round", 4, SQUARE);

    // Assert
    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => Math.round(slot.angle))).toEqual([0, 90, 180, 270]);
    expect(slots[0].x).toBeCloseTo(0, 5);
    expect(slots[0].y).toBeLessThan(0);
    const radii = slots.map((slot) => Math.hypot(slot.x, slot.y));
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0], 5);
  });

  it("faces every chair at the table it belongs to", () => {
    const slots = seatSlots("square", 4, SQUARE);
    const byAngle = new Map(slots.map((slot) => [Math.round(slot.angle), slot]));
    expect(byAngle.get(0)!.y).toBeLessThan(-SQUARE.h / 2);
    expect(byAngle.get(180)!.y).toBeGreaterThan(SQUARE.h / 2);
    expect(byAngle.get(270)!.x).toBeLessThan(-SQUARE.w / 2);
    expect(byAngle.get(90)!.x).toBeGreaterThan(SQUARE.w / 2);
  });

  it("spaces the chairs on one side so they never overlap", () => {
    const slots = seatSlots("rect", 12, LONG).filter((slot) => slot.angle === 0);
    expect(slots.length).toBeGreaterThan(1);
    for (let i = 1; i < slots.length; i += 1) {
      const gap = distance(slots[i - 1], slots[i]);
      expect(gap).toBeGreaterThanOrEqual((slots[i].w + slots[i - 1].w) / 2);
    }
  });

  it("spaces the chairs around a round table so they never overlap", () => {
    const slots = seatSlots("round", 10, SQUARE);
    for (let i = 1; i < slots.length; i += 1) {
      const gap = distance(slots[i - 1], slots[i]);
      expect(gap).toBeGreaterThanOrEqual((slots[i].w + slots[i - 1].w) / 2);
    }
  });

  it("stops drawing chairs for a banquet table — the seat count carries it", () => {
    const slots = seatSlots("rect", 40, LONG);
    expect(slots).toHaveLength(MAX_DRAWN_SEATS);
  });

  it("numbers the chairs so the party fills them in order", () => {
    const slots = seatSlots("square", 4, SQUARE);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3]);
  });
});

describe("furnitureExtent", () => {
  it("grows the node by a chair on every side", () => {
    // Arrange
    const chair = chairMetrics(SQUARE);

    // Act
    const extent = furnitureExtent(SQUARE);

    // Assert
    expect(extent.w).toBeCloseTo(SQUARE.w + 2 * (chair.depth + chair.gap), 5);
    expect(extent.h).toBeCloseTo(SQUARE.h + 2 * (chair.depth + chair.gap), 5);
  });

  it("keeps every chair inside the node it reports", () => {
    const extent = furnitureExtent(LONG);
    for (const slot of seatSlots("rect", 8, LONG)) {
      expect(Math.abs(slot.y) + slot.d / 2).toBeLessThanOrEqual(extent.h / 2 + 0.001);
      expect(Math.abs(slot.x) + slot.d / 2).toBeLessThanOrEqual(extent.w / 2 + 0.001);
    }
  });
});
