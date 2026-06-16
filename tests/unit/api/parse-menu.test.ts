/**
 * @jest-environment node
 *
 * Tests for POST /api/ai/parse-menu
 * Mocks the OpenRouter API (meta-llama/llama-3.3-70b-instruct) and Supabase auth.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
        },
    })
}

function makeSseChunk(content: string): string {
    return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
}

const VALID_PARSED_MENU = {
    categories: [{ name: 'Burgers', description: 'Juicy burgers', icon: '🍔' }],
    items: [
        {
            name: 'Classic Burger',
            description: 'Beef patty with lettuce',
            category: 'Burgers',
            price: 120,
        },
    ],
}

// ---------------------------------------------------------------------------
// Module mocks — must appear before any dynamic import of the route
// ---------------------------------------------------------------------------

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ai/parse-menu', () => {
    let mockCreateClient: jest.Mock<() => Promise<unknown>>
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(async () => {
        jest.resetModules()
        originalEnv = { ...process.env }
        process.env.OPENROUTER_API_KEY = 'test-openrouter-key'

        const { createClient } = await import('@/lib/supabase/server') as { createClient: jest.Mock<() => Promise<unknown>> }
        mockCreateClient = createClient

        // Default: authenticated superadmin
        mockCreateClient.mockResolvedValue({
            auth: {
                getUser: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
            },
            from: jest.fn<() => unknown>().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { role: 'superadmin' } }),
            }),
        })
    })

    afterEach(() => {
        process.env = originalEnv
    })

    // -----------------------------------------------------------------------
    // Auth / validation
    // -----------------------------------------------------------------------

    test('returns 401 when user is not authenticated', async () => {
        mockCreateClient.mockResolvedValue({
            auth: { getUser: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { user: null } }) },
            from: jest.fn(),
        })

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(401)
    })

    test('returns 403 when user is not superadmin', async () => {
        mockCreateClient.mockResolvedValue({
            auth: { getUser: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
            from: jest.fn<() => unknown>().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { role: 'admin' } }),
            }),
        })

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(403)
    })

    test('returns 400 when menuText is missing', async () => {
        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(400)
    })

    test('returns 400 when menuText exceeds 50000 characters', async () => {
        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'x'.repeat(50001) }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(400)
    })

    test('returns 500 when OPENROUTER_API_KEY is not set', async () => {
        delete process.env.OPENROUTER_API_KEY

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toMatch(/OPENROUTER_API_KEY/)
    })

    // -----------------------------------------------------------------------
    // OpenRouter API call — model and parameters
    // -----------------------------------------------------------------------

    test('calls OpenRouter API with correct model and parameters', async () => {
        const jsonChunk = JSON.stringify(VALID_PARSED_MENU)
        const sseChunks = [makeSseChunk(jsonChunk), 'data: [DONE]\n\n']
        const mockStream = makeSSEStream(sseChunks)

        const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
            new Response(mockStream, { status: 200 })
        )
        global.fetch = fetchMock

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        await POST(req)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')

        const requestBody = JSON.parse(init.body as string)
        expect(requestBody.model).toBe('meta-llama/llama-3.3-70b-instruct')
        expect(requestBody.temperature).toBe(0.2)
        expect(requestBody.top_p).toBe(0.7)
        expect(requestBody.max_tokens).toBe(1024)
        expect(requestBody.stream).toBe(true)
        expect(requestBody.messages[0].role).toBe('system')
        expect(requestBody.messages[1].role).toBe('user')
        expect(requestBody.messages[1].content).toContain('Burger P120')
    })

    test('passes Authorization header with OpenRouter API key', async () => {
        const jsonChunk = JSON.stringify(VALID_PARSED_MENU)
        const sseChunks = [makeSseChunk(jsonChunk), 'data: [DONE]\n\n']
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
            new Response(makeSSEStream(sseChunks), { status: 200 })
        )

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        await POST(req)

        const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
        const headers = init.headers as Record<string, string>
        expect(headers['Authorization']).toBe('Bearer test-openrouter-key')
    })

    // -----------------------------------------------------------------------
    // Successful parse
    // -----------------------------------------------------------------------

    test('returns parsed menu on success', async () => {
        const jsonChunk = JSON.stringify(VALID_PARSED_MENU)
        const sseChunks = [makeSseChunk(jsonChunk), 'data: [DONE]\n\n']
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
            new Response(makeSSEStream(sseChunks), { status: 200 })
        )

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.categories).toHaveLength(1)
        expect(body.data.categories[0].name).toBe('Burgers')
        expect(body.data.items).toHaveLength(1)
        expect(body.data.items[0].name).toBe('Classic Burger')
        expect(body.data.items[0].price).toBe(120)
    })

    test('strips markdown code fences from AI response', async () => {
        const wrapped = '```json\n' + JSON.stringify(VALID_PARSED_MENU) + '\n```'
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
            new Response(makeSSEStream([makeSseChunk(wrapped), 'data: [DONE]\n\n']), { status: 200 })
        )

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    test('returns 500 when OpenRouter API responds with non-200', async () => {
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
            new Response('{"error":"rate limit"}', { status: 429 })
        )

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(500)
    })

    test('returns 500 when AI response is not valid JSON', async () => {
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
            new Response(
                makeSSEStream([makeSseChunk('this is not json'), 'data: [DONE]\n\n']),
                { status: 200 }
            )
        )

        const { POST } = await import('@/app/api/ai/parse-menu/route')
        const req = new NextRequest('http://localhost/api/ai/parse-menu', {
            method: 'POST',
            body: JSON.stringify({ menuText: 'Burger P120' }),
            headers: { 'Content-Type': 'application/json' },
        })

        const res = await POST(req)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toMatch(/valid JSON/)
    })
})
