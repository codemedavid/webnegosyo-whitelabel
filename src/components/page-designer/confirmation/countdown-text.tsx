import type { ReactNode } from 'react'

const TOKEN = '{seconds}'
/** The token and the word before it ("… menu in {seconds}…" → "… menu…"). */
const TOKEN_WITH_LEAD = /\s*\S+\s+\{seconds\}|\s*\{seconds\}/gi

/**
 * A countdown sentence with its `{seconds}` shown as the bold accent number
 * ("Returning to the menu in **3s**..."). Before the first tick the number is
 * unknown, so the token and the word leading into it are left out
 * ("Returning to the menu...").
 */
export function CountdownText({ text, seconds }: { text: string; seconds: number | null }): ReactNode {
  const hasNumber = seconds !== null && seconds > 0
  if (!hasNumber) return text.replace(TOKEN_WITH_LEAD, '')
  const at = text.indexOf(TOKEN)
  if (at === -1) return text
  return (
    <>
      {text.slice(0, at)}
      <span className="font-bold text-[color:var(--co-accent)]">{seconds}s</span>
      {text.slice(at + TOKEN.length)}
    </>
  )
}
