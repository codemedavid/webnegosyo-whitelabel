/**
 * Quick requests a cashier taps into a line's kitchen note.
 *
 * A chip is one comma-separated part of the note, compared without case, so
 * tapping it again takes it back out and leaves whatever was typed alone.
 */

export const KITCHEN_NOTE_CHIPS: readonly string[] = [
  "No onion",
  "Less ice",
  "No sugar",
  "Less sugar",
  "Spicy",
  "Extra sauce",
  "Take-out",
];

const SEPARATOR = ", ";

function partsOf(note: string): string[] {
  return note
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isChip(part: string, chip: string): boolean {
  return part.toLowerCase() === chip.trim().toLowerCase();
}

export function hasNoteChip(note: string, chip: string): boolean {
  return partsOf(note).some((part) => isChip(part, chip));
}

/** The note with `chip` added at the end, or removed when it is already there. */
export function toggleNoteChip(note: string, chip: string): string {
  const parts = partsOf(note);
  const isPresent = parts.some((part) => isChip(part, chip));
  const next = isPresent ? parts.filter((part) => !isChip(part, chip)) : [...parts, chip.trim()];
  return next.join(SEPARATOR);
}
