/**
 * A diner's note for the kitchen on one dish ("no onions, less ice").
 *
 * Stored per line as `special_instructions` (order_items, Convex
 * `specialInstructions`) and printed on the kitchen ticket, chit, receipt and
 * Messenger message. The note is part of WHAT was ordered, so it is part of the
 * cart line's identity: two Burgers with different notes are two lines, the
 * same note typed twice is one.
 */

/**
 * What the storefront box accepts. Short on purpose — it is read off a kitchen
 * ticket — and well under the server's own cap
 * (`MAX_SPECIAL_INSTRUCTIONS_LENGTH`), so a typed note is never cut at checkout.
 */
export const ITEM_NOTE_MAX_LENGTH = 200

const WHITESPACE_RUN = /\s+/g

/** The note as stored: trimmed, single-spaced, capped; blank means no note. */
export function normalizeItemNote(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const tidy = raw.replace(WHITESPACE_RUN, ' ').trim().slice(0, ITEM_NOTE_MAX_LENGTH).trim()
  return tidy === '' ? undefined : tidy
}

/** FNV-1a (32-bit): short, stable, dependency-free — identity, not security. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The note's part of a cart line id. Same words in any spacing or capitals give
 * the same key; no note gives none, so lines without a note keep the id they
 * always had (carts already saved in browsers still match).
 */
export function itemNoteKey(raw: string | null | undefined): string | undefined {
  const note = normalizeItemNote(raw)
  return note ? `note:${fnv1a(note.toLowerCase())}` : undefined
}
