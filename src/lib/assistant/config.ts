/**
 * Owner assistant knobs. Every limit lives here so cost and safety can be
 * tuned in one place (and per environment where it says so).
 */

/** OpenRouter model for the assistant only; other AI features keep their own. */
export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL?.trim() || 'openai/gpt-6-luna'

/** Platform-wide kill switch: anything but the exact string `false` keeps it available. */
export function isAssistantGloballyEnabled(): boolean {
  return process.env.ASSISTANT_ENABLED?.trim() !== 'false'
}

/** Model round trips per owner message (tool calls + the final answer). */
export const MAX_STEPS_PER_TURN = 6
/** Output tokens per model call; answers are short, cards carry the detail. */
export const MAX_OUTPUT_TOKENS = 800
export { MAX_INPUT_CHARS } from '@/lib/assistant/limits'
/** Owner turns kept verbatim; older turns keep their text but lose tool output. */
export const HISTORY_FULL_TURNS = 4
/** Messages loaded from storage when rebuilding a conversation. */
export const HISTORY_LOAD_LIMIT = 40

/** Whole-turn ceiling, under the route's maxDuration. */
export const TURN_TIMEOUT_MS = 100_000
/** One tool's ceiling: a slow read must not eat the whole turn. */
export const TOOL_TIMEOUT_MS = 12_000
/** Reading menu photos waits on a vision model; still well inside TURN_TIMEOUT_MS. */
export const PHOTO_TOOL_TIMEOUT_MS = 70_000

/** Per-store daily allowance (Asia/Manila day), enforced atomically in Postgres. */
export const DAILY_MESSAGE_CAP = Number(process.env.ASSISTANT_DAILY_MESSAGES) || 60
export const DAILY_COST_CAP_USD = Number(process.env.ASSISTANT_DAILY_COST_USD) || 0.5

/** Burst limit per person, on top of the daily budget. */
export const BURST_LIMIT = { limit: 8, windowSec: 60 } as const

/** Largest facts payload a tool may hand the model, in characters of JSON. */
export const MAX_FACTS_CHARS = 3000
