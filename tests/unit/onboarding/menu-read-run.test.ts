/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingAssets, StoreOnboarding } from '@/lib/onboarding/repository'

const parseMenuWithAi = jest.fn()
let rowAssets: OnboardingAssets = {}
let rowStatus = 'awaiting_details'

jest.mock('@/lib/menu-import/parse-menu-ai', () => ({ parseMenuWithAi: (...a: unknown[]) => parseMenuWithAi(...a) }))
jest.mock('@/lib/menu-import/fetch-image', () => ({ fetchImageAsDataUrl: async (url: string) => `data:${url}` }))
jest.mock('@/lib/onboarding/repository', () => ({
  ...jest.requireActual('@/lib/onboarding/repository'),
  // The CAS write, applied to an in-memory row.
  updateOnboardingAssets: async (_c: unknown, _id: string, change: (a: OnboardingAssets) => OnboardingAssets | null) => {
    if (rowStatus !== 'awaiting_details') throw new Error('This store is already being built.')
    const next = change(rowAssets)
    if (next) rowAssets = next
    return next
  },
  findOnboardingById: async () => ({ assets: rowAssets }),
}))

const admin = {} as SupabaseClient
const onboarding = (): StoreOnboarding => ({
  id: 'onb-1', checkoutLeadId: 'lead', tenantId: null, status: 'awaiting_details', answers: null,
  assets: rowAssets, steps: {}, summary: null, error: null, attempts: 0, launchRequestedAt: null,
  createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
})
const PARSED = { categories: [{ name: 'Mains' }], items: [{ name: 'Adobo', category: 'Mains', price: 180 }] }

beforeEach(() => {
  rowAssets = { menuImageUrls: ['https://ik.imagekit.io/x/menu.jpg'] }
  rowStatus = 'awaiting_details'
  parseMenuWithAi.mockReset()
  parseMenuWithAi.mockResolvedValue({ ok: true, data: PARSED })
})

async function load() {
  return import('@/lib/onboarding/menu-read-run')
}

describe('requestMenuRead', () => {
  it('starts one read, runs it after the response, and hands back the dishes on the next poll', async () => {
    const { requestMenuRead } = await load()

    const first = await requestMenuRead(admin, onboarding(), '')
    expect(first.view.status).toBe('reading')
    expect(first.run).not.toBeNull()

    // A second poll while reading starts nothing new.
    const second = await requestMenuRead(admin, onboarding(), '')
    expect(second.run).toBeNull()
    expect(second.view.status).toBe('reading')

    await first.run?.()
    const third = await requestMenuRead(admin, onboarding(), '')
    expect(third.view).toEqual({ status: 'done', dishes: [{ name: 'Adobo', price: 180, category: 'Mains' }] })
    expect(parseMenuWithAi).toHaveBeenCalledTimes(1)
    expect(parseMenuWithAi.mock.calls[0][0]).toEqual({ text: undefined, images: ['data:https://ik.imagekit.io/x/menu.jpg'] })
  })

  it('never shows dishes from photos that changed while the read ran: the new photos get their own read', async () => {
    const { requestMenuRead } = await load()
    const first = await requestMenuRead(admin, onboarding(), '')
    rowAssets = { ...rowAssets, menuImageUrls: ['https://ik.imagekit.io/x/other.jpg'] }
    await first.run?.()

    const next = await requestMenuRead(admin, onboarding(), '')

    expect(next.view).toEqual({ status: 'reading', dishes: [] })
    expect(next.run).not.toBeNull()
  })

  it('does nothing with no photo and no text', async () => {
    const { requestMenuRead } = await load()
    rowAssets = {}

    const result = await requestMenuRead(admin, onboarding(), '   ')

    expect(result).toEqual({ view: { status: 'idle', dishes: [] }, run: null })
  })

  it('stops starting reads once the set-up used its allowance', async () => {
    const { requestMenuRead } = await load()
    rowAssets = { ...rowAssets, menuReadStarts: 8 }

    const result = await requestMenuRead(admin, onboarding(), '')

    expect(result.run).toBeNull()
    expect(result.view.status).toBe('idle')
  })

  it('records a failed read so the wizard falls back to typing', async () => {
    const { requestMenuRead } = await load()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    parseMenuWithAi.mockResolvedValue({ ok: false, error: 'unreadable', status: 500 })

    const first = await requestMenuRead(admin, onboarding(), '')
    await first.run?.()

    expect((await requestMenuRead(admin, onboarding(), '')).view.status).toBe('failed')
  })

  it('keeps quiet when the owner submitted before the read finished', async () => {
    const { requestMenuRead } = await load()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = await requestMenuRead(admin, onboarding(), '')
    rowStatus = 'queued'

    await expect(first.run?.()).resolves.toBeUndefined()
  })
})
