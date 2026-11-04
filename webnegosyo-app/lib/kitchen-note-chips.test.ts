import { KITCHEN_NOTE_CHIPS, hasNoteChip, toggleNoteChip } from "./kitchen-note-chips";

describe("kitchen note quick chips", () => {
  it("offers a short, fixed list of café requests — none that fights the order type", () => {
    expect(KITCHEN_NOTE_CHIPS).toEqual(["No sugar", "Less sugar", "Less ice", "No ice", "Extra hot", "No onion"]);
    // "Take-out" on a line read as an order type the sale did not have.
    expect(KITCHEN_NOTE_CHIPS.some((chip) => /take.?out|dine|delivery/i.test(chip))).toBe(false);
  });

  it("adds a chip to an empty note", () => {
    expect(toggleNoteChip("", "No onion")).toBe("No onion");
  });

  it("appends a chip after what was typed, comma separated", () => {
    expect(toggleNoteChip("well done", "Spicy")).toBe("well done, Spicy");
    expect(toggleNoteChip("well done, ", "Spicy")).toBe("well done, Spicy");
  });

  it("takes a chip back out, whatever its case, keeping the rest", () => {
    expect(toggleNoteChip("No onion, Spicy", "No onion")).toBe("Spicy");
    expect(toggleNoteChip("well done, spicy", "Spicy")).toBe("well done");
  });

  it("does not treat a longer phrase as the chip", () => {
    // "No sugar" is not "No sugar please" — toggling adds, never strips half a phrase.
    expect(toggleNoteChip("No sugar please", "No sugar")).toBe("No sugar please, No sugar");
    expect(hasNoteChip("No sugar please", "No sugar")).toBe(false);
  });

  it("reports whether a chip is in the note", () => {
    expect(hasNoteChip("Less ice, Extra hot", "extra hot")).toBe(true);
    expect(hasNoteChip("", "Spicy")).toBe(false);
  });
});
