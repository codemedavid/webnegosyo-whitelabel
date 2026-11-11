/**
 * Fill `{placeholders}` in a bot message. Pure, one pass: a value that itself
 * contains "{store}" (a dish called that) is never filled again.
 *
 * - Only keys present in `values` are touched; any other `{word}` is left as
 *   typed (rule texts saved before the registry keep their meaning).
 * - `{name}` with no name removes the token and the space/comma joining it:
 *   "Hi {name}! " → "Hi!", "Salamat, {name}." → "Salamat." — never "Hi !".
 * - A line whose placeholders ALL came out blank is dropped, so "📍 " never
 *   goes out alone for a store with no address.
 */

const TOKEN = /\{([a-z_]+)\}/g

export type FillValues = Readonly<Record<string, string | undefined>>

function withoutBlankName(text: string): string {
  return text
    .replace(/^[ \t]*\{name\}[ \t]*,?[ \t]*/gm, '')
    .replace(/[ \t]*,?[ \t]*\{name\}/g, '')
}

export function fillTemplate(text: string, values: FillValues): string {
  const source = values.name === '' ? withoutBlankName(text) : text
  return source
    .split('\n')
    .filter((line) => {
      const keys = [...line.matchAll(TOKEN)].map((match) => match[1]).filter((key) => values[key] !== undefined)
      return keys.length === 0 || keys.some((key) => values[key] !== '')
    })
    .map((line) => line.replace(TOKEN, (token, key: string) => values[key] ?? token))
    .join('\n')
    .trim()
}

/** The `{word}`s a text uses. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]))]
}

/**
 * A first name fit for a greeting: the first name-like word of what Messenger
 * gave us (letters, ' and -), at most 30 characters. Anything else = no name,
 * and `{name}` drops out of the message.
 */
export function greetingName(raw: string | null | undefined): string {
  const word = (raw ?? '').trim().split(/\s+/)[0] ?? ''
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(word)) return ''
  return Array.from(word).slice(0, 30).join('')
}
