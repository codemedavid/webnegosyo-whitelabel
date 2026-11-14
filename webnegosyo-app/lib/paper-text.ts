/**
 * Text as a thermal printhead can draw it.
 *
 * The driver sends UTF-8 and most 58/80mm printers read a single-byte code
 * page, so "×" (two UTF-8 bytes) prints as two stray glyphs. Add-on amounts
 * are STORED as "Fried Rice ×2" — the label web checkout, the register and
 * every parser share — so the fold happens here, at the paper, and nowhere
 * else. Same choice as the receipt engine's "Fries x1" discount lines.
 */
export function paperText(text: string): string {
  return text.replace(/×/g, "x");
}
