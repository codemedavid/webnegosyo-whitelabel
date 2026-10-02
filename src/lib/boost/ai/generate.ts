/**
 * One AI generation, start to finish:
 *
 *   claim a free slot → read menu, offers and order baskets → ask the model →
 *   validate every proposal → log them as pending
 *
 * A run that fails anywhere after the claim is marked failed, which gives the
 * slot back: a store never loses a free generation to an outage or to a model
 * that answered with nothing usable. Dependencies are injected so every path
 * is tested without a database or network.
 */

import { extractJsonFromAiResponse } from '@/lib/ai-menu-parser-request'
import type { ChatMessage } from '@/lib/ai/openrouter'
import type { BoostWorkspace } from '../workspace'
import type { BasketSummary } from '../order-baskets'
import { buildBoostAiFacts, type AiFactsPayload } from './facts'
import { buildBoostAiMessages } from './prompt'
import { normalizeAiProposals, type ProposalContext, type ProposalItem } from './proposals'
import type { CompletedGeneration } from './store'

export interface GenerationDeps {
  claim: () => Promise<string | null>
  loadWorkspace: () => Promise<BoostWorkspace>
  loadBaskets: () => Promise<BasketSummary>
  callModel: (messages: ChatMessage[]) => Promise<{ content: string; model: string }>
  complete: (generationId: string, result: CompletedGeneration) => Promise<void>
  fail: (generationId: string, message: string) => Promise<void>
}

export type GenerationOutcome =
  | { status: 'succeeded'; generationId: string; proposals: number }
  | { status: 'quota_exhausted' }
  | { status: 'failed'; error: string }

const NO_HISTORY_LABEL = 'no order history available'

export interface GenerationInputs {
  facts: AiFactsPayload
  context: ProposalContext
}

function comboItemIds(workspace: BoostWorkspace): string[][] {
  return workspace.combos.map((combo) => (combo.slots ?? []).flatMap((slot) => slot.included_item_ids ?? []))
}

/** Pure: the model's input and the validator's context from one snapshot. */
export function buildGenerationInputs(workspace: BoostWorkspace, baskets: BasketSummary): GenerationInputs {
  const upgrades = workspace.upgrades.map((u) => ({ sourceId: u.sourceId, targetId: u.targetId }))
  const pairingSourceIds = workspace.pairings.flatMap((group) => group.sourceIds)
  const combos = comboItemIds(workspace)

  const { payload, refToId } = buildBoostAiFacts({
    items: workspace.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      categoryName: item.categoryName,
      role: item.role,
      orders: baskets.itemOrders[item.id] ?? 0,
      isAvailable: item.isAvailable,
    })),
    pairs: baskets.pairs,
    orderCount: baskets.orderCount,
    windowLabel: baskets.isAvailable ? baskets.windowLabel : NO_HISTORY_LABEL,
    existing: { combos, upgrades, pairingSourceIds, lastCallEnabled: workspace.lastCall.enabled },
  })

  const items = new Map<string, ProposalItem>(
    workspace.items.map((item) => [item.id, {
      id: item.id,
      name: item.name,
      price: item.price,
      categoryName: item.categoryName,
      isAvailable: item.isAvailable,
    }])
  )

  return {
    facts: payload,
    context: {
      items,
      refToId,
      existing: {
        comboKeys: new Set(combos.map((ids) => [...new Set(ids)].sort().join('|'))),
        upgradeSourceIds: new Set(upgrades.map((u) => u.sourceId)),
        pairingSourceIds: new Set(pairingSourceIds),
      },
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The AI generation failed. Please try again.'
}

export async function runBoostAiGeneration(deps: GenerationDeps): Promise<GenerationOutcome> {
  const generationId = await deps.claim()
  if (!generationId) return { status: 'quota_exhausted' }

  try {
    const [workspace, baskets] = await Promise.all([deps.loadWorkspace(), deps.loadBaskets()])
    if (!workspace.items.some((item) => item.isAvailable)) {
      throw new Error('Add some available items to your menu first — there is nothing to build offers from.')
    }

    const { facts, context } = buildGenerationInputs(workspace, baskets)
    const answer = await deps.callModel(buildBoostAiMessages(facts))
    const { summary, ideas } = normalizeAiProposals(extractJsonFromAiResponse(answer.content), context)
    if (ideas.length === 0) {
      throw new Error('The AI did not come back with any offers that fit your menu. This try was not counted — please try again.')
    }

    await deps.complete(generationId, {
      model: answer.model,
      dataSource: baskets.dataSource,
      ordersAnalyzed: baskets.orderCount,
      summary,
      ideas,
    })
    return { status: 'succeeded', generationId, proposals: ideas.length }
  } catch (error) {
    const message = errorMessage(error)
    console.error('[boost-ai] generation failed:', error)
    await deps.fail(generationId, message)
    return { status: 'failed', error: message }
  }
}
