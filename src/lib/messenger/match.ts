/**
 * Keyword matching for Messenger rules. Pure.
 *
 * Text and keywords are normalised the same way — lower case, accents and
 * punctuation gone, spaces collapsed, a polite ending ("po", "pls") dropped —
 * and `contains` matches WHOLE words: "item" no longer fires inside "itemize",
 * which the old substring match did.
 */

const POLITE_ENDINGS = new Set(['po', 'pls', 'plz', 'please', 'poh'])

export type MatchMode = 'contains' | 'exact'

export function normalizeForMatch(text: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  while (words.length > 1 && POLITE_ENDINGS.has(words[words.length - 1])) words.pop()
  return words.join(' ')
}

/** True when `text` holds `keyword` (both raw; normalised here). Empty keywords never match. */
export function matchesKeyword(text: string, keyword: string, mode: MatchMode): boolean {
  const needle = normalizeForMatch(keyword)
  if (!needle) return false
  const haystack = normalizeForMatch(text)
  if (mode === 'exact') return haystack === needle
  return ` ${haystack} `.includes(` ${needle} `)
}

export function matchesAnyKeyword(text: string, keywords: readonly string[], mode: MatchMode): boolean {
  return keywords.some((keyword) => matchesKeyword(text, keyword, mode))
}
