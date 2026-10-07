/**
 * Ported verbatim from the web (src/lib/assistant/safe-text.ts) — the app
 * cannot import `src/`, and both surfaces must render a reply identically.
 *
 * The only formatting the assistant’s words get: paragraphs, bullet / numbered
 * lists and **bold**. Parsed into plain data that React renders as text nodes,
 * so model output can never become HTML, a link, or an image fetched from
 * somewhere (no markdown library, nothing to sanitise).
 */

export interface InlineRun {
  text: string
  isBold: boolean
}

export type TextBlock =
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "bullets"; items: InlineRun[][] }
  | { type: "numbered"; items: InlineRun[][] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
/** Headings and quotes are shown as plain text: strip their markers. */
const STRAY_MARKERS = /^\s*(#{1,6}|>)\s*/

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  const pattern = /\*\*(.+?)\*\*/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) runs.push({ text: text.slice(last, start), isBold: false })
    runs.push({ text: match[1], isBold: true })
    last = start + match[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), isBold: false })
  return runs.filter((run) => run.text.length > 0)
}

export function parseSafeText(source: string): TextBlock[] {
  const blocks: TextBlock[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", runs: parseInline(paragraph.join(" ")) })
    paragraph = []
  }
  const pushItem = (type: "bullets" | "numbered", text: string) => {
    flushParagraph()
    const previous = blocks[blocks.length - 1]
    const item = parseInline(text)
    if (previous && previous.type === type) {
      blocks[blocks.length - 1] = { type, items: [...previous.items, item] }
    } else {
      blocks.push({ type, items: [item] })
    }
  }

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(STRAY_MARKERS, "")
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (bullet) pushItem("bullets", bullet[1])
    else if (numbered) pushItem("numbered", numbered[1])
    else if (line.trim() === "") flushParagraph()
    else paragraph.push(line.trim())
  }
  flushParagraph()
  return blocks
}
