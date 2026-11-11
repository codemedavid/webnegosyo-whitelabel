import { readFileSync } from "fs";
import { join } from "path";
import { kitchenNotesOf } from "./kitchen-order-note";

/**
 * The ORDER-level note a guest (or cashier) typed into the store's own
 * checkout question. Live keys seen on platform stores: "Special Instructions "
 * (trailing space), "Any notes for us?", "Note", and the built-in
 * delivery_rider_note — which is for the rider, never the kitchen.
 */
describe("kitchenNotesOf", () => {
  it("picks the store's note questions, whatever they are called", () => {
    expect(kitchenNotesOf({ "Special Instructions ": "  no msg " })).toEqual(["no msg"]);
    expect(kitchenNotesOf({ "Any notes for us?": "birthday, add candle" })).toEqual([
      "birthday, add candle",
    ]);
    expect(kitchenNotesOf({ Note: "less salt" })).toEqual(["less salt"]);
    expect(kitchenNotesOf({ notes: "a" })).toEqual(["a"]);
    expect(kitchenNotesOf({ remarks: "b" })).toEqual(["b"]);
    expect(kitchenNotesOf({ kitchen_note: "c" })).toEqual(["c"]);
    expect(kitchenNotesOf({ "Any allergies?": "peanuts" })).toEqual(["peanuts"]);
    expect(kitchenNotesOf({ "Special requests": "extra rice" })).toEqual(["extra rice"]);
  });

  it("leaves rider and address notes to the delivery card", () => {
    expect(
      kitchenNotesOf({
        delivery_rider_note: "call at gate",
        "Note for the rider": "blue gate",
        "Delivery notes": "leave at guard",
        "Landmark notes": "near church",
        "Address notes": "unit 4",
      }),
    ).toEqual([]);
  });

  it("ignores the register's payment blob, other answers and non-text values", () => {
    expect(
      kitchenNotesOf({
        pos: { note: "not this" },
        name: "Maria",
        "Table number": "4",
        notes: 12,
        "Special Instructions": "   ",
      }),
    ).toEqual([]);
  });

  it("keeps every distinct note once, in the order they were asked", () => {
    expect(
      kitchenNotesOf({ Note: "no ice", "Special Instructions": "No ice", remarks: "rush" }),
    ).toEqual(["no ice", "rush"]);
  });

  it("answers nothing for a missing or malformed blob", () => {
    expect(kitchenNotesOf(null)).toEqual([]);
    expect(kitchenNotesOf(undefined)).toEqual([]);
    expect(kitchenNotesOf("notes" as unknown)).toEqual([]);
    expect(kitchenNotesOf(["a"] as unknown)).toEqual([]);
  });
});

/**
 * Every chit printer hands the order's answers to the chit, or the NOTE line
 * silently never prints. The watcher and the board reprint spread the whole
 * ticket order (which carries `customerData`); the register passes its own.
 */
describe("kitchen chit callers carry the order's answers", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

  it.each([
    ["components/GlobalKitchenAutoPrint.tsx"],
    ["app/(main)/kitchen.tsx"],
  ])("%s spreads the ticket's order into the chit", (path) => {
    expect(read(path)).toMatch(/buildKitchenChitSegments\(\{\s*\.\.\.ticket\.order,/);
  });

  it("the register passes the sale's customerData", () => {
    expect(read("lib", "pos-kitchen-print.ts")).toMatch(/customerData: args\.customerData/);
  });
});

describe("order-level notes are printed raw on the kitchen chit", () => {
  it("drops ESC/GS and every other control byte, so a guest can't send printer commands", () => {
    const notes = kitchenNotesOf({ Notes: "No onions\u001b@\u001dV\u0000please\u009b" });
    expect(notes).toEqual(["No onions @ V please"]);
    expect(notes[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  });

  it("a note of nothing but control bytes is no note", () => {
    expect(kitchenNotesOf({ Notes: "\u001b\u001d\u0007" })).toEqual([]);
  });
});
