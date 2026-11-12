import { appConfigSchema } from '@/lib/app-contract'

describe('projectAppConfig', () => {
  const load = async () => (await import('@/lib/app-api/project-config')).projectAppConfig

  const NOW = new Date('2026-10-26T04:00:00Z')
  const TENANT = { id: '00000000-0000-4000-8000-000000000001', slug: 'kape', name: 'Kape Demo' }
  const ORDER_TYPES = [
    { type: 'pickup', is_enabled: true, available_on_web: true },
    { type: 'delivery', is_enabled: true, available_on_web: true },
    { type: 'dine_in', is_enabled: true, available_on_web: false },
  ]
  const BANNERS = [
    { id: 'b1', imageUrl: 'https://cdn.example.com/b1.jpg', title: 'Sea Salt is back', description: 'Limited time' },
    { id: 'b2', imageUrl: 'http://insecure.example.com/b2.jpg' },
  ]

  const base = (overrides: Record<string, unknown> = {}) => ({
    tenant: { ...TENANT, ...overrides },
    published: null,
    orderTypes: ORDER_TYPES,
    outlets: [],
    now: NOW,
  })

  it('produces a contract-valid config for a bare store', async () => {
    const projectAppConfig = await load()
    const config = projectAppConfig(base())
    expect(appConfigSchema.safeParse(config).success).toBe(true)
    expect(config.tenant).toEqual({ ...TENANT, currency: 'PHP' })
  })

  it('offers only the web order modes the store has switched on', async () => {
    const projectAppConfig = await load()
    expect(projectAppConfig(base()).features.orderModes).toEqual({ pickup: true, delivery: true, dineIn: false })
  })

  it('narrows modes to what at least one active branch supports when multi-branch is on', async () => {
    const projectAppConfig = await load()
    const config = projectAppConfig({
      ...base({ multi_branch_enabled: true }),
      outlets: [
        { is_active: true, supports_pickup: true, supports_delivery: false, supports_dine_in: true },
        { is_active: false, supports_pickup: true, supports_delivery: true, supports_dine_in: true },
      ],
    })
    expect(config.features.multiBranch).toBe(true)
    expect(config.features.orderModes).toEqual({ pickup: true, delivery: false, dineIn: false })
  })

  it('blocks ordering for a pre-launch store and says loyalty only when it is live (an unread shadow flag reads as shadow)', async () => {
    const projectAppConfig = await load()
    expect(projectAppConfig(base({ is_prelaunch: true })).features.ordering).toBe(false)
    expect(projectAppConfig(base()).features.ordering).toBe(true)
    expect(projectAppConfig(base({ loyalty_enabled: true, loyalty_shadow: true })).features.loyalty).toBe(false)
    expect(projectAppConfig(base({ loyalty_enabled: true })).features.loyalty).toBe(false)
    expect(projectAppConfig(base({ loyalty_enabled: true, loyalty_shadow: false })).features.loyalty).toBe(true)
    expect(projectAppConfig(base()).features.onlinePayments).toBe(false)
  })

  it('builds a default home from the store: visible https banners, quick actions for its modes, no loyalty blocks without loyalty', async () => {
    const projectAppConfig = await load()
    const config = projectAppConfig(base({ promotion_banners: BANNERS, is_promotion_visible: true }))
    const types = config.home.blocks.map((block) => block.type)
    expect(types).not.toContain('memberCard')
    expect(types).not.toContain('rewardsTeaser')
    const carousel = config.home.blocks.find((block) => block.type === 'bannerCarousel')
    expect(carousel && carousel.type === 'bannerCarousel' ? carousel.banners.map((b) => b.id) : []).toEqual(['b1'])
    const actions = config.home.blocks.find((block) => block.type === 'quickActions')
    expect(actions && actions.type === 'quickActions' ? actions.actions : []).toEqual(['pickup', 'delivery'])
  })

  it('hides banners the merchant has switched off on the menu', async () => {
    const projectAppConfig = await load()
    const config = projectAppConfig(base({ promotion_banners: BANNERS, is_promotion_visible: false }))
    expect(config.home.blocks.some((block) => block.type === 'bannerCarousel')).toBe(false)
  })

  it('adds member card and rewards teaser when loyalty is live, and the announcement when visible', async () => {
    const projectAppConfig = await load()
    const config = projectAppConfig(base({ loyalty_enabled: true, loyalty_shadow: false, announcement_text: 'Closed on Nov 1', is_announcement_visible: true }))
    const types = config.home.blocks.map((block) => block.type)
    expect(types[0]).toBe('memberCard')
    expect(types).toContain('rewardsTeaser')
    expect(types).toContain('announcement')
  })

  it('uses the published App Studio layout and copy when they are valid', async () => {
    const projectAppConfig = await load()
    const published = {
      copy: { greeting: 'Kumusta!' },
      theme: { fontKey: 'nunito', corners: 'round' },
      home: { blocks: [{ id: 'menu', type: 'categoriesRail', visibleWhen: 'always', title: 'Browse' }] },
    }
    const config = projectAppConfig({ ...base(), published })
    expect(config.copy.greeting).toBe('Kumusta!')
    expect(config.theme.fontKey).toBe('nunito')
    expect(config.theme.corners).toBe('round')
    expect(config.home.blocks).toEqual(published.home.blocks)
  })

  it('ignores a published config that fails the contract rather than shipping a broken home', async () => {
    const projectAppConfig = await load()
    const published = { copy: { greeting: '' }, home: { blocks: [{ id: 'x', type: 'unknownBlock' }] } }
    const config = projectAppConfig({ ...base(), published })
    expect(appConfigSchema.safeParse(config).success).toBe(true)
    expect(config.home.blocks.some((block) => block.type === 'categoriesRail')).toBe(true)
  })
})
