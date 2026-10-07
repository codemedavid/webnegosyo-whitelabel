/**
 * Menu text and/or menu photos → structured menu data, via a vision model on
 * OpenRouter.
 *
 * Lifted out of `POST /api/ai/parse-menu` so server code (the automated store
 * onboarding) can parse a menu without a console session. Authorization is the
 * CALLER's job: this function only talks to the model.
 */

import { finalizeParsedMenuData } from '@/lib/ai-menu-parser-utils'
import {
    PARSE_MENU_MODEL,
    PARSE_MENU_MAX_TOKENS,
    validateParseMenuRequest,
    buildParseMenuMessages,
    extractJsonFromAiResponse,
} from '@/lib/ai-menu-parser-request'
import type { ParsedMenuData } from '@/types/ai-menu-parser'

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

export interface ParseMenuWithAiInput {
    text?: string
    /** `data:image/{png,jpeg,webp};base64,...` URLs, at most MAX_MENU_IMAGES. */
    images?: string[]
}

export interface ParseMenuWithAiOptions {
    apiKey?: string
    fetchImpl?: typeof fetch
}

export type ParseMenuWithAiResult =
    | { ok: true; data: ParsedMenuData }
    | { ok: false; error: string; status: number }

function fail(error: string, status: number): ParseMenuWithAiResult {
    return { ok: false, error, status }
}

/** Aggregate an OpenRouter SSE stream into the assistant's full text. */
async function readStreamedContent(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let content = ''
    let sseBuffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            // Keep the last (possibly partial) line in the buffer
            sseBuffer = lines.pop() ?? ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data: ')) continue
                const data = trimmed.slice(6)
                if (data === '[DONE]') continue

                try {
                    const delta = JSON.parse(data).choices?.[0]?.delta?.content
                    if (delta) content += delta
                } catch {
                    // Skip malformed SSE chunks
                }
            }
        }
    } finally {
        reader.releaseLock()
    }

    return content
}

export async function parseMenuWithAi(
    input: ParseMenuWithAiInput,
    opts: ParseMenuWithAiOptions = {},
): Promise<ParseMenuWithAiResult> {
    const validation = validateParseMenuRequest({ menuText: input.text ?? '', images: input.images ?? [] })
    if (!validation.ok) return fail(validation.error, 400)

    const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY
    if (!apiKey) {
        return fail('OpenRouter API key not configured. Please set OPENROUTER_API_KEY environment variable.', 500)
    }

    const fetchImpl = opts.fetchImpl ?? fetch

    // Stream from OpenRouter to avoid serverless response timeouts on
    // large menus, aggregating the deltas server-side.
    const response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://webnegosyo.com',
            'X-Title': 'WebNegosyo Menu Parser',
        },
        body: JSON.stringify({
            model: PARSE_MENU_MODEL,
            messages: buildParseMenuMessages(validation.input),
            temperature: 0.2,
            top_p: 0.7,
            max_tokens: PARSE_MENU_MAX_TOKENS,
            stream: true,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error('[Parse Menu] OpenRouter API error:', errorText)
        return fail('Failed to parse menu with AI. Please try again.', 500)
    }

    if (!response.body) return fail('Failed to read streaming response', 500)

    const aiContent = await readStreamedContent(response.body)
    if (!aiContent) return fail('No response from AI. Please try again.', 500)

    const rawParsed = extractJsonFromAiResponse(aiContent)
    if (rawParsed === null) {
        console.error('[Parse Menu] Could not extract JSON. Raw AI response:', aiContent)
        return fail('AI response was not valid JSON. Please try again.', 500)
    }

    const data = finalizeParsedMenuData(rawParsed)
    if (data.items.length === 0) {
        return fail('AI could not find any menu items. Try a clearer photo or add the menu as text.', 422)
    }

    return { ok: true, data }
}
