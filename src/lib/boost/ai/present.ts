/**
 * The AI offer ideas as the merchant app shows them.
 *
 * The app cannot import `src/`, so every word on an idea card is written here:
 * title and detail through the same `describeIdea` the Boost Sales screen uses,
 * item names instead of ids, and only the ideas still worth showing.
 */

import { describeIdea, type NamedItemLookup } from '../describe-idea'
import type { BoostIdeaKind } from '../ideas'
import { generationsLeft, type ProposalStatus } from './lifecycle'
import type { BoostAiGeneration, BoostAiLog, GenerationStatus } from './store'

/** A phone screen, not an archive: older ideas are on the web's Boost Sales. */
export const MAX_PRESENTED_PROPOSALS = 20

export interface BoostAiProposalView {
  id: string
  kind: BoostIdeaKind
  status: ProposalStatus
  title: string
  detail: string
  reason: string
  itemNames: string[]
}

export interface BoostAiLatestRun {
  status: GenerationStatus
  summary: string | null
  ordersAnalyzed: number
  createdAt: string
  error: string | null
}

export interface BoostAiStateView {
  /** Off = customers see none of these offers until Boost Sales is turned on. */
  boostEnabled: boolean
  quota: { used: number; limit: number; left: number }
  latest: BoostAiLatestRun | null
  proposals: BoostAiProposalView[]
}

function latestRun(generation: BoostAiGeneration | undefined): BoostAiLatestRun | null {
  if (!generation) return null
  return {
    status: generation.status,
    summary: generation.summary,
    ordersAnalyzed: generation.ordersAnalyzed,
    createdAt: generation.createdAt,
    error: generation.error,
  }
}

export function presentBoostAiState(log: BoostAiLog, items: NamedItemLookup, boostEnabled: boolean): BoostAiStateView {
  // Newest run first (the log's order); a dismissed idea stays dismissed.
  const proposals = log.generations
    .filter((generation) => generation.status === 'succeeded')
    .flatMap((generation) => generation.proposals)
    .filter((proposal) => proposal.status !== 'rejected')
    .slice(0, MAX_PRESENTED_PROPOSALS)
    .map((proposal): BoostAiProposalView => {
      const { title, detail } = describeIdea(proposal.idea, items)
      return {
        id: proposal.id,
        kind: proposal.kind,
        status: proposal.status,
        title,
        detail,
        reason: proposal.idea.reason,
        itemNames: proposal.idea.itemIds
          .map((id) => items.get(id)?.name)
          .filter((name): name is string => !!name),
      }
    })

  return {
    boostEnabled,
    quota: { used: log.used, limit: log.limit, left: generationsLeft(log.used, log.limit) },
    latest: latestRun(log.generations[0]),
    proposals,
  }
}
