import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { convertToModelMessages, createIdGenerator, stepCountIs, streamText, type UIMessage } from 'ai'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { resolveAssistantAccess } from '@/lib/assistant/access'
import {
  BURST_LIMIT,
  DAILY_COST_CAP_USD,
  DAILY_MESSAGE_CAP,
  HISTORY_FULL_TURNS,
  HISTORY_LOAD_LIMIT,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_STEPS_PER_TURN,
  ASSISTANT_MODEL,
  TURN_TIMEOUT_MS,
} from '@/lib/assistant/config'
import { compactHistory, type StoredMessage } from '@/lib/assistant/history'
import { checkMessagePhotos, photoMarkerPart } from '@/lib/assistant/photos'
import { loadActionStatuses } from '@/lib/assistant/actions/store'
import { withActionStatuses } from '@/lib/assistant/actions/status'
import { SYSTEM_PROMPT, buildContextNote } from '@/lib/assistant/prompt'
import { createRefBook } from '@/lib/assistant/refs'
import { claimAssistantTurn, loadMessages, openConversation, recordAssistantUsage, saveMessage, saveRefMap } from '@/lib/assistant/store'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { availableTools, createTurnMemo } from '@/lib/assistant/tools/registry'
import { assistantModel, buildToolSet } from '@/lib/assistant/runtime/ai-sdk'
import { summarizeTurnUsage } from '@/lib/assistant/usage'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

/**
 * POST /api/assistant/chat — one owner message in, one streamed answer out.
 *
 * The browser sends ONLY its new message; history is rebuilt from storage, so
 * a client cannot forge earlier tool results or inflate the prompt. Every
 * refusal (auth, flag, budget) happens before streaming starts and is a plain
 * JSON error.
 *
 * The web admin authenticates with its cookie session; the merchant app sends
 * its own access token as `Authorization: Bearer` (see bearer-session.ts).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid().nullable(),
  message: z.object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(MAX_INPUT_CHARS),
    /** Menu photos as data URLs; checked by checkMessagePhotos, never stored. */
    images: z.array(z.unknown()).optional(),
  }),
})

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 })

function fail(status: number, error: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } })
}

export function POST(request: NextRequest): Promise<Response> {
  return withRequestBearer(request, () => handleChat(request))
}

async function handleChat(request: NextRequest): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail(400, 'That message could not be sent.')
  const { tenantId, conversationId, message } = parsed.data
  const photoCheck = checkMessagePhotos(message.images)
  if (!photoCheck.ok) return fail(400, photoCheck.error)
  const { photos } = photoCheck

  const access = await resolveAssistantAccess(tenantId)
  if (!access.ok) return fail(access.status, access.error)
  const { caller, store, flags } = access

  const burst = await checkRateLimit(`assistant:${caller.userId}`, { ...BURST_LIMIT, onRedisFailure: 'instance' })
  if (!burst.allowed) {
    return fail(429, 'You’re sending messages quickly — give it a moment.', { 'Retry-After': String(burst.retryAfterSec) })
  }
  if (!(await claimAssistantTurn(store.id, DAILY_MESSAGE_CAP, DAILY_COST_CAP_USD))) {
    return fail(429, 'Your store has used today’s assistant allowance. It resets at midnight.')
  }

  const conversation = await openConversation(store.id, caller.userId, conversationId, message.text)
  if (!conversation) return fail(404, 'That conversation could not be found.')

  const [stored, actionStatuses] = await Promise.all([
    loadMessages(conversation.id, HISTORY_LOAD_LIMIT),
    conversationId ? loadActionStatuses(conversation.id) : Promise.resolve(new Map<string, string>()),
  ])
  // Proposals confirmed or cancelled since: the model must hear the outcome.
  const history = withActionStatuses(stored, actionStatuses)
  // Only a count is stored: the photos themselves live for this turn alone.
  const userMessage: StoredMessage = {
    id: message.id,
    role: 'user',
    parts: [{ type: 'text', text: message.text }, ...(photos.length > 0 ? [photoMarkerPart(photos.length)] : [])],
  }
  await saveMessage(store.id, conversation.id, userMessage)

  const refs = createRefBook(conversation.refMap)
  const tools = availableTools(ASSISTANT_TOOLS, caller, flags)
  const toolSet = buildToolSet(tools, {
    tenantId: store.id,
    tenantSlug: store.slug,
    conversationId: conversation.id,
    caller,
    flags,
    refs,
    photos,
    memo: createTurnMemo(),
  })

  const thread = [...history, userMessage]
  const modelMessages = await convertToModelMessages(compactHistory(thread, HISTORY_FULL_TURNS) as unknown as UIMessage[], {
    tools: toolSet,
    ignoreIncompleteToolCalls: true,
  })

  const result = streamText({
    model: assistantModel(caller.userId),
    system: `${SYSTEM_PROMPT}\n\n${buildContextNote({ storeName: store.name, now: new Date(), toolNames: tools.map((t) => t.name), photoCount: photos.length })}`,
    messages: modelMessages,
    tools: toolSet,
    stopWhen: stepCountIs(MAX_STEPS_PER_TURN),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS),
  })
  // Finish (and record usage) even if the owner closes the panel mid-answer.
  void result.consumeStream()

  return result.toUIMessageStreamResponse({
    headers: NO_STORE,
    originalMessages: thread as unknown as UIMessage[],
    generateMessageId,
    messageMetadata: ({ part }) => (part.type === 'start' ? { conversationId: conversation.id } : undefined),
    onError: (error) => {
      console.error('[assistant] stream failed', { tenantId: store.id, message: error instanceof Error ? error.message : String(error) })
      return 'Sorry — I couldn’t finish that. Please try again.'
    },
    onFinish: async ({ responseMessage }) => {
      try {
        const usage = summarizeTurnUsage(await result.steps)
        await Promise.all([
          saveMessage(store.id, conversation.id, responseMessage as unknown as StoredMessage, { model: ASSISTANT_MODEL, ...usage }),
          saveRefMap(conversation.id, refs.snapshot()),
          recordAssistantUsage(store.id, usage.inputTokens + usage.outputTokens, usage.costUsd),
        ])
      } catch (error) {
        console.error('[assistant] could not persist turn', { tenantId: store.id, message: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
