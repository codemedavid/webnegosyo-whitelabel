import type { PaperWidth } from "./printer-registry";

/**
 * Receipt markup → ESC/POS control bytes, applied right before printBill.
 *
 * The layout engine styles lines with `<C>` (centre), `<R>` (right), `<B>`
 * (bold), `<H>` (double height) and `<W>` (double width and height) so that
 * the Studio preview, the browser print and the thermal printer all read one
 * text. Neither driver can be handed those tags: the Android parser knows no
 * bold tag and drops any `<` it does not recognise, and the iOS path strips
 * tags outright — then centres every call by default. Raw control bytes pass
 * through both untouched, so they are emitted here and the tags never reach
 * a driver.
 */

const ESC = "\x1B";

const ALIGN: Record<"left" | "center" | "right", string> = {
  left: `${ESC}a\x00`,
  center: `${ESC}a\x01`,
  right: `${ESC}a\x02`,
};

/** ESC ! n — bit 3 emphasised, bit 4 double height, bit 5 double width. */
const FONT_BOLD = 0x08;
const FONT_TALL = 0x10;
const FONT_WIDE = 0x20;

const TAG_PATTERN = /<(\/?)([CRBHW])>/g;

interface FontState {
  bold: number;
  tall: number;
  wide: number;
}

function fontBytes(state: FontState): string {
  const n =
    (state.bold > 0 ? FONT_BOLD : 0) |
    (state.tall > 0 ? FONT_TALL : 0) |
    (state.wide > 0 ? FONT_TALL | FONT_WIDE : 0);
  return `${ESC}!${String.fromCharCode(n)}`;
}

/** ESC E n — the dedicated bold switch, for heads that ignore the font bit. */
function boldBytes(isOn: boolean): string {
  return `${ESC}E${isOn ? "\x01" : "\x00"}`;
}

export function receiptMarkupToEscPos(text: string): string {
  let out = ALIGN.left;
  let last = 0;
  const state: FontState = { bold: 0, tall: 0, wide: 0 };

  for (const match of text.matchAll(TAG_PATTERN)) {
    out += text.slice(last, match.index);
    last = match.index + match[0].length;
    const isClose = match[1] === "/";
    const tag = match[2];
    const delta = isClose ? -1 : 1;

    if (tag === "C" || tag === "R") {
      out += isClose ? ALIGN.left : tag === "C" ? ALIGN.center : ALIGN.right;
      continue;
    }
    if (tag === "B") {
      state.bold = Math.max(0, state.bold + delta);
      out += fontBytes(state) + boldBytes(state.bold > 0);
      continue;
    }
    if (tag === "H") state.tall = Math.max(0, state.tall + delta);
    if (tag === "W") state.wide = Math.max(0, state.wide + delta);
    out += fontBytes(state);
  }

  return out + text.slice(last);
}

/** Text columns at font A (12 dots per character). */
export function charsForPaperWidth(paperWidth: PaperWidth): number {
  return paperWidth === 80 ? 48 : 32;
}

/** The value the iOS driver's `printerWidthType` option understands. */
export function printerWidthType(paperWidth: PaperWidth): "58" | "80" {
  return paperWidth === 80 ? "80" : "58";
}
