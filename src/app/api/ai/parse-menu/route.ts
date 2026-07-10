import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finalizeParsedMenuData } from '@/lib/ai-menu-parser-utils'
import {
    PARSE_MENU_MODEL,
    PARSE_MENU_MAX_TOKENS,
    validateParseMenuRequest,
    buildParseMenuMessages,
    extractJsonFromAiResponse,
} from '@/lib/ai-menu-parser-request'
import type {
    ParsedCategory,
    ParsedVariation,
    ParsedVariationType,
    ParsedAddon,
    ParsedMenuItem,
    ParsedMenuData,
} from '@/types/ai-menu-parser'

// Re-exported for backward compatibility with existing imports of these types
// from this route module (e.g. the bulk-menu-import route).
export type {
    ParsedCategory,
    ParsedVariation,
    ParsedVariationType,
    ParsedAddon,
    ParsedMenuItem,
    ParsedMenuData,
}

/**
 * POST /api/ai/parse-menu
 * Parses raw menu text and/or menu photos into structured menu data using
 * a vision-capable model via OpenRouter. Superadmin only.
 */
export async function POST(request: NextRequest) {
    try {
        // Verify user is superadmin
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: appUser } = await supabase
            .from('app_users')
            .select('role')
            .eq('user_id', user.id)
            .single() as { data: { role: string } | null }

        if (!appUser || appUser.role !== 'superadmin') {
            return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
        }

        const validation = validateParseMenuRequest(await request.json())
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 })
        }

        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) {
            return NextResponse.json({
                error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY environment variable.'
            }, { status: 500 })
        }

        // Stream from OpenRouter to avoid serverless response timeouts on
        // large menus, aggregating the deltas server-side.
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            return NextResponse.json({
                error: 'Failed to parse menu with AI. Please try again.'
            }, { status: 500 })
        }

        const reader = response.body?.getReader()
        if (!reader) {
            return NextResponse.json({
                error: 'Failed to read streaming response'
            }, { status: 500 })
        }

        const decoder = new TextDecoder()
        let aiContent = ''
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
                        const parsed = JSON.parse(data)
                        const content = parsed.choices?.[0]?.delta?.content
                        if (content) {
                            aiContent += content
                        }
                    } catch {
                        // Skip malformed SSE chunks
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        if (!aiContent) {
            return NextResponse.json({
                error: 'No response from AI. Please try again.'
            }, { status: 500 })
        }

        const rawParsed = extractJsonFromAiResponse(aiContent)
        if (rawParsed === null) {
            console.error('[Parse Menu] Could not extract JSON. Raw AI response:', aiContent)
            return NextResponse.json({
                error: 'AI response was not valid JSON. Please try again.',
            }, { status: 500 })
        }

        const parsedMenu = finalizeParsedMenuData(rawParsed)
        if (parsedMenu.items.length === 0) {
            return NextResponse.json({
                error: 'AI could not find any menu items. Try a clearer photo or add the menu as text.',
            }, { status: 422 })
        }

        return NextResponse.json({
            success: true,
            data: parsedMenu,
        })

    } catch (error) {
        console.error('[Parse Menu] Error:', error)
        return NextResponse.json({
            error: 'Failed to parse menu'
        }, { status: 500 })
    }
}
