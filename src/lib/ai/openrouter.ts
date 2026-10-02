/**
 * One chat completion through OpenRouter, server-side only.
 *
 * The same provider and key the menu parser and Growth Coach use. If the
 * primary model id is rejected (renamed / unavailable) the call is retried once
 * with the fallback model, the way the Growth Coach does.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterChatRequest {
  model: string
  fallbackModel?: string
  messages: readonly ChatMessage[]
  maxTokens: number
  temperature?: number
  timeoutMs: number
  /** Shown in the OpenRouter dashboard. */
  title: string
}

export interface OpenRouterChatResult {
  content: string
  model: string
}

export interface OpenRouterDeps {
  apiKey?: string
  fetch?: typeof fetch
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/** Statuses that mean "this model id is the problem", worth one retry on the fallback. */
const MODEL_REJECTED_STATUSES = new Set([400, 404])

async function callOnce(
  request: OpenRouterChatRequest,
  model: string,
  apiKey: string,
  doFetch: typeof fetch
): Promise<Response> {
  return doFetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://webnegosyo.com',
      'X-Title': request.title,
    },
    body: JSON.stringify({
      model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.4,
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
  })
}

function contentOf(body: unknown): string {
  const choices = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

export async function openRouterChat(
  request: OpenRouterChatRequest,
  deps: OpenRouterDeps = {}
): Promise<OpenRouterChatResult> {
  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('AI is not configured on this server (OPENROUTER_API_KEY is missing).')
  const doFetch = deps.fetch ?? fetch

  let model = request.model
  let response = await callOnce(request, model, apiKey, doFetch)
  if (!response.ok && MODEL_REJECTED_STATUSES.has(response.status) && request.fallbackModel && request.fallbackModel !== model) {
    console.warn(`[openrouter] model "${model}" rejected (${response.status}); retrying with ${request.fallbackModel}`)
    model = request.fallbackModel
    response = await callOnce(request, model, apiKey, doFetch)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`[openrouter] ${response.status} from ${model}:`, detail.slice(0, 500))
    throw new Error('The AI service did not answer. Please try again in a moment.')
  }

  const content = contentOf(await response.json())
  if (!content.trim()) throw new Error('The AI returned an empty answer. Please try again.')
  return { content, model }
}
