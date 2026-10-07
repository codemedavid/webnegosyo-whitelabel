import { summarizeTurnUsage } from '@/lib/assistant/usage'

describe('summarizeTurnUsage', () => {
  test('adds tokens and OpenRouter cost across every step of a turn', () => {
    const usage = summarizeTurnUsage([
      { usage: { inputTokens: 1200, outputTokens: 40, inputTokenDetails: { cacheReadTokens: 1024 } }, providerMetadata: { openrouter: { usage: { cost: 0.00012 } } } },
      { usage: { inputTokens: 1500, outputTokens: 120, inputTokenDetails: { cacheReadTokens: 1280 } }, providerMetadata: { openrouter: { usage: { cost: 0.0002 } } } },
    ])

    expect(usage).toEqual({ inputTokens: 2700, cachedInputTokens: 2304, outputTokens: 160, costUsd: 0.00032 })
  })

  test('treats missing or garbage numbers as zero instead of NaN', () => {
    const usage = summarizeTurnUsage([{ usage: { inputTokens: undefined }, providerMetadata: { openrouter: { usage: { cost: 'free' } } } }, {}])

    expect(usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 })
  })
})
