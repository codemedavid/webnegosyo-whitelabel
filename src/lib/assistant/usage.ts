/**
 * What one owner turn cost, summed over its model steps.
 *
 * OpenRouter reports the billed USD per call in provider metadata
 * (`openrouter.usage.cost`, with usage accounting on). Token counts come from
 * the SDK's normalized usage. Pure, so the budget arithmetic is tested.
 */

export interface StepUsageLike {
  usage?: {
    inputTokens?: number | undefined
    outputTokens?: number | undefined
    inputTokenDetails?: { cacheReadTokens?: number | undefined }
  }
  providerMetadata?: Record<string, unknown> | undefined
}

export interface TurnUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costUsd: number
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function stepCost(step: StepUsageLike): number {
  const openrouter = step.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined
  return finite(openrouter?.usage?.cost)
}

export function summarizeTurnUsage(steps: readonly StepUsageLike[]): TurnUsage {
  return steps.reduce<TurnUsage>(
    (total, step) => ({
      inputTokens: total.inputTokens + finite(step.usage?.inputTokens),
      cachedInputTokens: total.cachedInputTokens + finite(step.usage?.inputTokenDetails?.cacheReadTokens),
      outputTokens: total.outputTokens + finite(step.usage?.outputTokens),
      costUsd: total.costUsd + stepCost(step),
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 },
  )
}
