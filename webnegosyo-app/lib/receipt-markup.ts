import type { ReceiptTextAlign } from "./receipt-layout";

/**
 * Receipt markup → styled lines, for surfaces that draw type rather than send
 * printer bytes: the Receipt editor's paper preview. The tags are the engine's
 * own — `<C>`/`<R>` align the line, `<B>` bolds, `<H>` doubles the height and
 * `<W>` doubles width and height — and like the ESC/POS translator
 * (`receipt-escpos.ts`), nested copies of a tag are counted, so a style stays
 * on until the last one closes.
 *
 * Mirror of the line parser in `src/lib/receipt-markup.ts` (the web Studio's
 * preview) — the two previews must draw the same paper.
 */

export interface ReceiptRun {
  text: string;
  bold: boolean;
  tall: boolean;
  wide: boolean;
}

export interface ReceiptPreviewLine {
  align: ReceiptTextAlign;
  /** The line holds double-height type, so it takes two rows of paper. */
  isTall: boolean;
  runs: ReceiptRun[];
}

const TAG_PATTERN = /<(\/?)([CRBHW])>/g;

export function parseReceiptMarkupLine(line: string): ReceiptPreviewLine {
  const runs: ReceiptRun[] = [];
  const depth = { B: 0, H: 0, W: 0 };
  let align: ReceiptTextAlign = "left";
  let last = 0;

  const pushText = (text: string) => {
    if (text === "") return;
    runs.push({ text, bold: depth.B > 0, tall: depth.H > 0, wide: depth.W > 0 });
  };

  for (const match of line.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    pushText(line.slice(last, index));
    last = index + match[0].length;
    const isClose = match[1] === "/";
    const tag = match[2] as "C" | "R" | "B" | "H" | "W";
    if (tag === "C" || tag === "R") {
      if (!isClose && align === "left") align = tag === "C" ? "center" : "right";
      continue;
    }
    depth[tag] = Math.max(0, depth[tag] + (isClose ? -1 : 1));
  }
  pushText(line.slice(last));

  return { align, isTall: runs.some((run) => run.tall || run.wide), runs };
}

export function parseReceiptMarkup(text: string): ReceiptPreviewLine[] {
  return text.split("\n").map(parseReceiptMarkupLine);
}
