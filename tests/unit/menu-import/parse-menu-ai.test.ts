/**
 * @jest-environment node
 */
import { describe, test, expect } from '@jest/globals'

function sse(contents: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            for (const content of contents) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
        },
    })
}

const MENU_JSON = JSON.stringify({
    categories: [{ name: 'Burgers' }],
    items: [{ name: 'Classic Burger', description: 'Beef patty', category: 'Burgers', price: 120 }],
})

function streamingFetch(contents: string[], calls: Array<{ url: string; init?: RequestInit }> = []) {
    return (async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return new Response(sse(contents), { status: 200 })
    }) as unknown as typeof fetch
}

async function load() {
    return import('@/lib/menu-import/parse-menu-ai')
}

describe('parseMenuWithAi', () => {
    test('aggregates the streamed answer into parsed menu data', async () => {
        const { parseMenuWithAi } = await load()
        const calls: Array<{ url: string; init?: RequestInit }> = []
        const half = Math.floor(MENU_JSON.length / 2)
        const result = await parseMenuWithAi(
            { text: 'Classic Burger P120' },
            { apiKey: 'k', fetchImpl: streamingFetch([MENU_JSON.slice(0, half), MENU_JSON.slice(half)], calls) },
        )
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.data.items).toHaveLength(1)
        expect(result.data.items[0].name).toBe('Classic Burger')
        expect(calls[0].url).toContain('openrouter.ai')
        expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer k')
    })

    test('refuses an empty request as a 400 without calling the model', async () => {
        const { parseMenuWithAi } = await load()
        const calls: Array<{ url: string; init?: RequestInit }> = []
        const result = await parseMenuWithAi({}, { apiKey: 'k', fetchImpl: streamingFetch([], calls) })
        expect(result).toMatchObject({ ok: false, status: 400 })
        expect(calls).toHaveLength(0)
    })

    test('reports a missing API key as a 500', async () => {
        const { parseMenuWithAi } = await load()
        const saved = process.env.OPENROUTER_API_KEY
        delete process.env.OPENROUTER_API_KEY
        try {
            const result = await parseMenuWithAi({ text: 'Burger P120' }, { fetchImpl: streamingFetch([MENU_JSON]) })
            expect(result).toMatchObject({ ok: false, status: 500 })
            if (!result.ok) expect(result.error).toMatch(/OPENROUTER_API_KEY/)
        } finally {
            if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved
        }
    })

    test('reports an upstream failure as a 500', async () => {
        const { parseMenuWithAi } = await load()
        const failing = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch
        const result = await parseMenuWithAi({ text: 'Burger P120' }, { apiKey: 'k', fetchImpl: failing })
        expect(result).toMatchObject({ ok: false, status: 500 })
    })

    test('reports non-JSON output as a 500', async () => {
        const { parseMenuWithAi } = await load()
        const result = await parseMenuWithAi({ text: 'Burger P120' }, { apiKey: 'k', fetchImpl: streamingFetch(['no json here']) })
        expect(result).toMatchObject({ ok: false, status: 500 })
    })

    test('reports a menu with no items as a 422', async () => {
        const { parseMenuWithAi } = await load()
        const empty = JSON.stringify({ categories: [], items: [] })
        const result = await parseMenuWithAi({ text: 'Burger P120' }, { apiKey: 'k', fetchImpl: streamingFetch([empty]) })
        expect(result).toMatchObject({ ok: false, status: 422 })
    })
})
