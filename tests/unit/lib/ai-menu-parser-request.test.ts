/**
 * Tests for src/lib/ai-menu-parser-request.ts — the pure request/response
 * plumbing behind POST /api/ai/parse-menu v2:
 *
 * - validateParseMenuRequest: accepts text and/or menu images (data URLs),
 *   enforces size/count/mime limits.
 * - buildParseMenuMessages: builds OpenRouter chat messages; image mode
 *   emits multimodal `image_url` content parts.
 * - extractJsonFromAiResponse: robustly pulls the JSON object out of the
 *   model output even when wrapped in prose or code fences.
 * - PARSE_MENU_MODEL: the vision-capable model requested for this feature.
 */

import { describe, test, expect } from '@jest/globals'
import {
    validateParseMenuRequest,
    buildParseMenuMessages,
    extractJsonFromAiResponse,
    PARSE_MENU_MODEL,
    MAX_MENU_TEXT_LENGTH,
    MAX_MENU_IMAGES,
} from '@/lib/ai-menu-parser-request'

const PNG_DATA_URL = `data:image/png;base64,${'A'.repeat(100)}`
const JPEG_DATA_URL = `data:image/jpeg;base64,${'B'.repeat(100)}`

describe('PARSE_MENU_MODEL', () => {
    test('uses the requested Gemma multimodal model', () => {
        expect(PARSE_MENU_MODEL).toBe('google/gemma-4-26b-a4b-it')
    })
})

describe('validateParseMenuRequest', () => {
    test('accepts a text-only request', () => {
        const result = validateParseMenuRequest({ menuText: 'Burger P100' })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.input.menuText).toBe('Burger P100')
            expect(result.input.images).toEqual([])
        }
    })

    test('accepts an image-only request', () => {
        const result = validateParseMenuRequest({ images: [PNG_DATA_URL] })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.input.images).toEqual([PNG_DATA_URL])
        }
    })

    test('accepts text and images together', () => {
        const result = validateParseMenuRequest({
            menuText: 'extra notes',
            images: [PNG_DATA_URL, JPEG_DATA_URL],
        })

        expect(result.ok).toBe(true)
    })

    test('rejects a request with neither text nor images', () => {
        const result = validateParseMenuRequest({ menuText: '   ' })

        expect(result.ok).toBe(false)
    })

    test('rejects non-object bodies', () => {
        expect(validateParseMenuRequest(null).ok).toBe(false)
        expect(validateParseMenuRequest('text').ok).toBe(false)
    })

    test('rejects menu text longer than the limit', () => {
        const result = validateParseMenuRequest({
            menuText: 'x'.repeat(MAX_MENU_TEXT_LENGTH + 1),
        })

        expect(result.ok).toBe(false)
    })

    test('rejects more than the maximum number of images', () => {
        const images = Array.from({ length: MAX_MENU_IMAGES + 1 }, () => PNG_DATA_URL)

        const result = validateParseMenuRequest({ images })

        expect(result.ok).toBe(false)
    })

    test('rejects images that are not data URLs with an allowed mime type', () => {
        expect(validateParseMenuRequest({ images: ['https://evil.test/menu.png'] }).ok).toBe(false)
        expect(validateParseMenuRequest({ images: ['data:text/html;base64,AAAA'] }).ok).toBe(false)
        expect(validateParseMenuRequest({ images: ['data:image/svg+xml;base64,AAAA'] }).ok).toBe(false)
    })

    test('rejects oversized images', () => {
        const huge = `data:image/png;base64,${'A'.repeat(8_000_000)}`

        const result = validateParseMenuRequest({ images: [huge] })

        expect(result.ok).toBe(false)
    })
})

describe('buildParseMenuMessages', () => {
    test('text-only input produces a system prompt plus a plain-string user message', () => {
        const messages = buildParseMenuMessages({ menuText: 'Burger P100', images: [] })

        expect(messages[0].role).toBe('system')
        expect(typeof messages[0].content).toBe('string')
        expect(messages[1].role).toBe('user')
        expect(typeof messages[1].content).toBe('string')
        expect(messages[1].content).toContain('Burger P100')
    })

    test('image input produces multimodal content parts with image_url entries', () => {
        const messages = buildParseMenuMessages({ menuText: '', images: [PNG_DATA_URL, JPEG_DATA_URL] })

        const userContent = messages[1].content
        expect(Array.isArray(userContent)).toBe(true)
        if (Array.isArray(userContent)) {
            const imageParts = userContent.filter(part => part.type === 'image_url')
            expect(imageParts).toHaveLength(2)
            expect(imageParts[0]).toEqual({
                type: 'image_url',
                image_url: { url: PNG_DATA_URL },
            })
            const textParts = userContent.filter(part => part.type === 'text')
            expect(textParts.length).toBeGreaterThan(0)
        }
    })

    test('text alongside images is included as a text content part', () => {
        const messages = buildParseMenuMessages({ menuText: 'Prices are in PHP', images: [PNG_DATA_URL] })

        const userContent = messages[1].content
        if (Array.isArray(userContent)) {
            const combinedText = userContent
                .filter(part => part.type === 'text')
                .map(part => ('text' in part ? part.text : ''))
                .join(' ')
            expect(combinedText).toContain('Prices are in PHP')
        } else {
            throw new Error('expected multimodal content')
        }
    })

    test('system prompt asks for appetizing descriptions and shared addonGroups', () => {
        const messages = buildParseMenuMessages({ menuText: 'x', images: [] })
        const systemPrompt = String(messages[0].content)

        expect(systemPrompt.toLowerCase()).toContain('appetizing')
        expect(systemPrompt).toContain('addonGroups')
        expect(systemPrompt).toContain('appliesTo')
    })
})

describe('extractJsonFromAiResponse', () => {
    test('parses a bare JSON object', () => {
        expect(extractJsonFromAiResponse('{"a":1}')).toEqual({ a: 1 })
    })

    test('parses JSON inside a ```json code fence', () => {
        const raw = '```json\n{"categories":[],"items":[]}\n```'

        expect(extractJsonFromAiResponse(raw)).toEqual({ categories: [], items: [] })
    })

    test('parses JSON surrounded by prose', () => {
        const raw = 'Here is the parsed menu:\n{"items":[{"name":"Burger {deluxe}"}]}\nLet me know!'

        expect(extractJsonFromAiResponse(raw)).toEqual({ items: [{ name: 'Burger {deluxe}' }] })
    })

    test('handles braces inside string values', () => {
        const raw = 'Result: {"note":"use { and } carefully","n":2} done'

        expect(extractJsonFromAiResponse(raw)).toEqual({ note: 'use { and } carefully', n: 2 })
    })

    test('returns null when no valid JSON object is present', () => {
        expect(extractJsonFromAiResponse('sorry, I cannot parse this menu')).toBeNull()
        expect(extractJsonFromAiResponse('{"broken": ')).toBeNull()
        expect(extractJsonFromAiResponse('')).toBeNull()
    })
})
