/**
 * What the model re-reads from earlier turns.
 *
 * Recent turns go back whole (their tool results arrive as compact facts via
 * `toModelOutput`). Older turns keep only their words: the cards they produced
 * stay on screen, and re-sending old tool output every turn is where chat
 * costs quietly grow.
 */

export interface StoredPart {
  type: string
  [key: string]: unknown
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  parts: StoredPart[]
}

/** Parts the model never needs to see again. */
const NEVER_RESENT = new Set(['reasoning', 'step-start', 'source-url', 'source-document', 'file'])

function keepPart(part: StoredPart, isRecent: boolean): boolean {
  if (NEVER_RESENT.has(part.type) || part.type.startsWith('data-')) return false
  return isRecent || part.type === 'text'
}

export function compactHistory<M extends StoredMessage>(messages: readonly M[], fullTurns: number): M[] {
  const userIndexes = messages.flatMap((message, index) => (message.role === 'user' ? [index] : []))
  const recentFrom = userIndexes.length > fullTurns ? userIndexes[userIndexes.length - fullTurns] : 0

  return messages
    .map((message, index) => ({ ...message, parts: message.parts.filter((part) => keepPart(part, index >= recentFrom)) }))
    .filter((message) => message.parts.length > 0)
}

/** The plain text of a message, for titles and logs. */
export function messageText(message: Pick<StoredMessage, 'parts'>): string {
  return message.parts
    .flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : []))
    .join(' ')
    .trim()
}
