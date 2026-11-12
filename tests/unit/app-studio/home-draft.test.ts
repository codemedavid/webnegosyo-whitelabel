import { appPublishedConfigSchema, projectAppConfig } from '@/lib/app-api/project-config'
import { APP_HOME_BLOCK_TYPES_FOR_TEST, checkDraftForPublish, moveBlock, newBlock, sameDraft, startingDraft } from './home-draft-fixtures'

const input = {
  tenant: { id: 't-1', slug: 'kape', name: 'Kape Demo', loyalty_enabled: true, loyalty_shadow: false },
  orderTypes: [{ type: 'pickup', is_enabled: true, available_on_web: true }],
  outlets: [],
  now: new Date('2026-11-12T02:00:00Z'),
}

describe('startingDraft', () => {
  const effective = projectAppConfig({ ...input, published: null })

  it('opens on what the app shows today when nothing was saved', () => {
    const draft = startingDraft({}, null, effective)
    expect(draft.home?.blocks.map((block) => block.type)).toEqual(effective.home.blocks.map((block) => block.type))
    expect(appPublishedConfigSchema.safeParse(draft).success).toBe(true)
  })

  it('prefers the saved draft, then what is published; an unreadable one is skipped', () => {
    const published = { home: { blocks: [{ id: 'menu', type: 'categoriesRail', visibleWhen: 'always', title: 'Menu' }] } }
    const draft = { home: { blocks: [{ id: 'note', type: 'announcement', visibleWhen: 'always', text: 'Hi', tone: 'info' }] } }
    expect(startingDraft(draft, published, effective).home?.blocks[0].id).toBe('note')
    expect(startingDraft({}, published, effective).home?.blocks[0].id).toBe('menu')
    expect(startingDraft({ home: 'broken' }, published, effective).home?.blocks[0].id).toBe('menu')
  })
})

describe('checkDraftForPublish', () => {
  it('passes a draft the app accepts and returns the config it would receive', () => {
    const checked = checkDraftForPublish({ copy: { greeting: 'Kumusta' }, home: { blocks: [newBlock('categoriesRail', [])] } }, input)
    expect(checked.ok && checked.config.copy.greeting).toBe('Kumusta')
  })

  it('refuses what the app would throw away, saying where', () => {
    const duplicate = { home: { blocks: [newBlock('orderAgain', []), { ...newBlock('orderAgain', []) }] } }
    const checked = checkDraftForPublish(duplicate, input)
    expect(checked.ok).toBe(false)
    const badBanner = { home: { blocks: [{ ...newBlock('bannerCarousel', []), banners: [{ id: 'b', imageUrl: 'http://x.example.com/a.jpg' }] }] } }
    const refused = checkDraftForPublish(badBanner, input)
    expect(!refused.ok && refused.error).toMatch(/home › blocks › 0 › banners/)
  })
})

describe('block helpers', () => {
  it('every new block type passes the contract with a unique id', () => {
    const blocks = APP_HOME_BLOCK_TYPES_FOR_TEST.reduce<ReturnType<typeof newBlock>[]>((acc, type) => [...acc, newBlock(type, acc), newBlock(type, [...acc, newBlock(type, acc)])], [])
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length)
    expect(checkDraftForPublish({ home: { blocks: blocks.slice(0, 20) } }, input).ok).toBe(true)
  })

  it('moves a block up or down and ignores a move off either end', () => {
    const blocks = [newBlock('memberCard', []), newBlock('orderAgain', []), newBlock('categoriesRail', [])]
    expect(moveBlock(blocks, 2, -1).map((block) => block.type)).toEqual(['memberCard', 'categoriesRail', 'orderAgain'])
    expect(moveBlock(blocks, 0, -1)).toEqual(blocks)
  })

  it('compares drafts by content, not key order', () => {
    expect(sameDraft({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
    expect(sameDraft({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('previewConfig', () => {
  it('matches what the config route would serve once the draft is published', async () => {
    const { previewConfig } = await import('@/lib/app-studio/home-draft')
    const draft = { copy: { greeting: 'Kumusta' }, theme: { corners: 'sharp' as const }, home: { blocks: [newBlock('orderAgain', [])] } }
    const base = projectAppConfig({ ...input, published: null })
    expect(previewConfig(base, draft)).toEqual(projectAppConfig({ ...input, published: draft }))
    expect(previewConfig(base, {})).toEqual(base)
  })
})
