/**
 * The ORDER-level note for the kitchen, picked out of the checkout answers.
 *
 * Stores ask "Notes", "Special Instructions", "Any notes for us?" … as their
 * own checkout question (web checkout, the register's "More details"). The
 * answer rides in `customer_data` under whatever the store called it, and the
 * kitchen never saw it: the ticket read only the table number and the chit
 * had no field for it.
 *
 * Questions for the rider or the address (unit, landmark, rider note — the
 * delivery card's `classifyDetailKey`) are left out; so is the register's
 * `pos` payment blob, and anything that is not text.
 */

import { classifyDetailKey } from "./delivery-details";

/**
 * Every C0 control, DEL and C1 control — the same set as the web's
 * `src/lib/item-note.ts`. The note prints raw on a thermal chit, where ESC
 * (0x1B) and GS (0x1D) start ESC/POS commands (reset, cut, drawer kick), and
 * the answer is whatever a guest typed at checkout.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const WHITESPACE_RUN = /\s+/g;

/** The register's own payment/tender blob, never a guest answer. */
const NEVER_NOTE_KEYS = new Set(["pos"]);

/**
 * Words that make a question a note. Same note words as
 * `delivery-details.ts` (`NOTE_WORDS`), plus the food-side ones a kitchen
 * must see (allergies, special requests).
 */
const NOTE_WORDS = new Set([
  "note", "notes", "remark", "remarks", "instruction", "instructions",
  "paalala", "bilin", "mensahe", "message",
  "request", "requests", "allergy", "allergies",
]);

/** "Any notes for us?" → ["any", "notes", "for", "us"]; "kitchenNote" → ["kitchen", "note"]. */
function labelWords(key: string): string[] {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isKitchenNoteKey(key: string): boolean {
  if (NEVER_NOTE_KEYS.has(key)) return false;
  const words = labelWords(key);
  if (words.includes("address")) return false;
  if (!words.some((word) => NOTE_WORDS.has(word))) return false;
  // Unit / landmark / rider questions belong on the delivery card.
  return classifyDetailKey(key.trim()) === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every distinct order-level kitchen note, trimmed, in the order the store
 * asked them. Empty when there is none (or the blob is not an object).
 */
export function kitchenNotesOf(customerData: unknown): string[] {
  if (!isRecord(customerData)) return [];
  return Object.entries(customerData).reduce<string[]>((notes, [key, value]) => {
    if (typeof value !== "string" || !isKitchenNoteKey(key)) return notes;
    const text = value.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
    if (!text) return notes;
    const isDuplicate = notes.some((note) => note.toLowerCase() === text.toLowerCase());
    return isDuplicate ? notes : [...notes, text];
  }, []);
}
