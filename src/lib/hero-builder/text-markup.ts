import { safeHref } from './safe-values'

/**
 * Tiny, safe inline markup for text widgets: **bold**, *italic*,
 * [label](https://link) and line breaks. Produces tokens, never HTML, so the
 * renderer builds React elements and nothing is ever parsed as markup.
 */
export type MarkupToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'break' }

const PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\)|\n)/g
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/

export function parseMarkup(input: unknown): MarkupToken[] {
  if (typeof input !== 'string' || input.length === 0) return []
  const tokens: MarkupToken[] = []
  // split() with one capture group alternates plain text (even) and matched
  // markup (odd). Only matched parts are markup — plain text like `****`
  // must stay literal instead of being re-read as italic.
  for (const [i, part] of input.split(PATTERN).entries()) {
    if (!part) continue
    if (i % 2 === 0) tokens.push({ type: 'text', text: part })
    else if (part === '\n') tokens.push({ type: 'break' })
    else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) tokens.push({ type: 'bold', text: part.slice(2, -2) })
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) tokens.push({ type: 'italic', text: part.slice(1, -1) })
    else {
      const link = LINK.exec(part)
      const href = link ? safeHref(link[2]) : null
      if (link && href) tokens.push({ type: 'link', text: link[1], href })
      else tokens.push({ type: 'text', text: link ? link[1] : part })
    }
  }
  return tokens
}
