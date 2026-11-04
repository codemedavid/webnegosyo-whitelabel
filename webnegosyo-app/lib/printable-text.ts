/**
 * Text that is safe to hand a thermal printer.
 *
 * Everything on a receipt or a kitchen chit — dish names, notes, customer
 * names typed on the web checkout — reaches the head as raw bytes, and a
 * printer acts on control bytes wherever they appear: ESC @ resets it, GS V
 * cuts the paper, ESC p kicks the cash drawer open. Only the encoder's own
 * commands may carry them, so typed text keeps its line breaks, has tabs and
 * carriage returns turned into plain spacing, and loses every other C0
 * control, DEL and the C1 range (0x80–0x9F).
 */

const LINE_BREAK = /\r\n?/g;
const SPACING = /[\t\v\f]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x09\x0B-\x1F\x7F-\x9F]/g;

export function toPrintableText(text: string): string {
  return text.replace(LINE_BREAK, "\n").replace(SPACING, " ").replace(CONTROL, "");
}
