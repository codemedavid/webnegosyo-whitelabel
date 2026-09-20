import { splitOnLinesLoaded } from "./autoprint-lines";

/**
 * An auto-print watcher claims a chit BEFORE printing it, so a chit that goes
 * out without its lines is never reprinted — the claim already marked it done.
 * Since the line-item read is keyed on the orders on screen, a brand-new order
 * reaches `orders` a moment before its lines reach `allItems`.
 */
describe("splitOnLinesLoaded", () => {
  it("prints an order whose lines have arrived", () => {
    expect(splitOnLinesLoaded(["a"], new Map([["a", 2]]))).toEqual({
      printable: ["a"],
      waiting: [],
    });
  });

  it("holds an order that is on the board with no lines read yet", () => {
    // The blank-chit case: without this the watcher prints an itemless chit
    // and claims it, so the real one never comes out.
    expect(splitOnLinesLoaded(["a"], new Map([["a", 0]]))).toEqual({
      printable: [],
      waiting: ["a"],
    });
  });

  it("holds every order while the line read has not answered at all", () => {
    const noLinesYet = new Map([
      ["a", 0],
      ["b", 0],
    ]);

    expect(splitOnLinesLoaded(["a", "b"], noLinesYet)).toEqual({
      printable: [],
      waiting: ["a", "b"],
    });
  });

  it("drops an order that left the board before its lines ever arrived", () => {
    // Held forever it would leak; it was never claimed, so the ticket's own
    // reprint button still has it.
    expect(splitOnLinesLoaded(["gone"], new Map([["a", 1]]))).toEqual({
      printable: [],
      waiting: [],
    });
  });

  it("splits a mixed batch and keeps the order it was given", () => {
    const counts = new Map([
      ["ready", 3],
      ["waiting", 0],
      ["alsoReady", 1],
    ]);

    expect(splitOnLinesLoaded(["ready", "waiting", "alsoReady", "gone"], counts)).toEqual({
      printable: ["ready", "alsoReady"],
      waiting: ["waiting"],
    });
  });

  it("has nothing to do with an empty batch", () => {
    expect(splitOnLinesLoaded([], new Map([["a", 1]]))).toEqual({ printable: [], waiting: [] });
  });
});
