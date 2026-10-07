/**
 * Filing a proposal: store the validated payload, hand the browser a confirm
 * card, and tell the model plainly that nothing has changed yet.
 */

import { createPendingAction } from '@/lib/assistant/actions/store'
import type { ActionKind } from '@/lib/assistant/actions/kinds'
import type { AssistantToolContext } from '@/lib/assistant/tools/registry'
import type { ConfirmCard, ToolResult } from '@/lib/assistant/types'

interface ProposalSpec {
  kind: ActionKind
  payload: unknown
  summary: string
  title: string
  lines: ConfirmCard['lines']
  warning?: string
}

export async function fileProposal(ctx: AssistantToolContext, spec: ProposalSpec): Promise<ToolResult> {
  const { id, expiresAt } = await createPendingAction({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    createdBy: ctx.caller.userId,
    kind: spec.kind,
    payload: spec.payload,
    summary: spec.summary,
  })
  return {
    facts: {
      proposed: true,
      status: 'pending',
      summary: spec.summary,
      note: 'Shown to the user as a card with Confirm / Cancel. Nothing has changed yet; do not say it is done.',
    },
    card: { type: 'confirm', actionId: id, title: spec.title, lines: spec.lines, warning: spec.warning, expiresAt },
  }
}

/** A proposal the validator refused: say why, change nothing. */
export function refused(reason: string): ToolResult {
  return { facts: { proposed: false, reason } }
}
