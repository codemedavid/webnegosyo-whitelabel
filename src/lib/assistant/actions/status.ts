/**
 * Tell the model what happened to its proposals since. A propose_* tool's
 * stored output says "pending" forever; before the history is re-sent, each
 * proposal's facts get its CURRENT status, so the model never claims a change
 * was made (or tells the owner to tap a card that already ran).
 */

import type { StoredMessage, StoredPart } from '@/lib/assistant/history'

interface ProposalOutput {
  facts?: Record<string, unknown>
  card?: { type?: string; actionId?: string; status?: string }
}

function patchPart(part: StoredPart, statuses: ReadonlyMap<string, string>): StoredPart {
  const output = part.output as ProposalOutput | undefined
  const actionId = output?.card?.type === 'confirm' ? output.card.actionId : undefined
  if (!actionId || !statuses.has(actionId)) return part
  const status = statuses.get(actionId)
  return { ...part, output: { ...output, facts: { ...(output?.facts ?? {}), status }, card: { ...output?.card, status } } }
}

export function withActionStatuses<M extends StoredMessage>(messages: readonly M[], statuses: ReadonlyMap<string, string>): M[] {
  if (statuses.size === 0) return [...messages]
  return messages.map((message) =>
    message.role === 'assistant' ? { ...message, parts: message.parts.map((part) => patchPart(part, statuses)) } : message,
  )
}
