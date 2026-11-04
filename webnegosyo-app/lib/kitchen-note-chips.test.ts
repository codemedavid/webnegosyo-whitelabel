import { KITCHEN_NOTE_CHIPS, hasNoteChip, toggleNoteChip } from "./kitchen-note-chips";

describe("kitchen note quick chips", () => {
  it("offers the common requests in a fixed order", () => {
    expect(KITCHEN_NOTE_CHIPS).toEqual([
      "No onion",
      "Less ice",
      "No sugar",
      "Less sugar",
      "Spicy",
      "Extra sauce",
      "Take-out",
    ]);
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
    expect(hasNoteChip("Less ice, Take-out", "take-out")).toBe(true);
    expect(hasNoteChip("", "Spicy")).toBe(false);
  });
});
