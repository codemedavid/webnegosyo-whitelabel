/**
 * The one place the assistant touches the AI SDK and OpenRouter (besides the
 * route). Everything else under src/lib/assistant is plain TypeScript.
 */

import 'server-only'

import { tool, type ToolSet } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createLogger } from '@/lib/logger'
import { ASSISTANT_MODEL, TOOL_TIMEOUT_MS } from '@/lib/assistant/config'
import { factsForModel, type AssistantToolContext, type AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const log = createLogger('[Assistant]', 'DEBUG_ASSISTANT')

/** What the model hears when a tool fails: no internals, and no invented zeros. */
const UNAVAILABLE: ToolResult = {
  facts: { available: false, reason: 'This data could not be loaded right now. Say so; do not guess.' },
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function runSafely(def: AssistantToolDef, ctx: AssistantToolContext, input: unknown): Promise<ToolResult> {
  try {
    return await withTimeout(def.run(ctx, input), def.timeoutMs ?? TOOL_TIMEOUT_MS)
  } catch (error) {
    log.error('tool failed', { tool: def.name, tenantId: ctx.tenantId, message: error instanceof Error ? error.message : String(error) })
    return UNAVAILABLE
  }
}

/**
 * The SDK tool set. The FULL result (card, chips) streams to the browser as the
 * tool part's output; `toModelOutput` hands the model only the scrubbed facts.
 */
export function buildToolSet(defs: readonly AssistantToolDef[], ctx: AssistantToolContext): ToolSet {
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: def.input,
        execute: (input: unknown) => runSafely(def, ctx, input),
        toModelOutput: ({ output }) => ({ type: 'json', value: factsForModel(output as ToolResult) as never }),
      }),
    ]),
  )
}

export function assistantModel(userId: string) {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://www.webnegosyo.com',
      'X-Title': 'WebNegosyo Owl',
    },
  })
  return openrouter.chat(ASSISTANT_MODEL, {
    usage: { include: true },
    reasoning: { effort: 'low' },
    // Never route store data to a provider that keeps it.
    provider: { data_collection: 'deny', require_parameters: true },
    // Lets OpenRouter attribute abuse to an account without learning who it is.
    user: userId,
  })
}
