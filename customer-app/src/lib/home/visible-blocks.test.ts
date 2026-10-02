import { VALID_CATALOG, VALID_CONFIG } from '@/fixtures/contract-fixtures'
import type { AppCatalog, AppConfig, AppHomeBlock } from '@/lib/contract'
import { resolveFeaturedItems, visibleBlocks } from './visible-blocks'

const config = VALID_CONFIG as unknown as AppConfig
const catalog = VALID_CATALOG as unknown as AppCatalog
const ids = (blocks: AppHomeBlock[]) => blocks.map((block) => block.id)

describe('visibleBlocks', () => {
  it('shows member-only blocks to members and guest-only blocks to guests', () => {
    expect(ids(visibleBlocks(config.home.blocks, { isMember: true, features: config.features }))).toEqual([
      'member',
      'hero',
      'actions',
      'again',
      'featured',
    ])
    expect(ids(visibleBlocks(config.home.blocks, { isMember: false, features: config.features }))).toEqual([
      'member',
      'hero',
      'actions',
      'featured',
      'rewards',
    ])
  })

  it('drops loyalty blocks when the store has no loyalty', () => {
    const features = { ...config.features, loyalty: false }
    const result = ids(visibleBlocks(config.home.blocks, { isMember: false, features }))
    expect(result).not.toContain('member')
    expect(result).not.toContain('rewards')
  })

  it('removes quick actions for disabled modes, and the block when none remain', () => {
    const features = { ...config.features, orderModes: { pickup: true, delivery: false, dineIn: false } }
    const [actions] = visibleBlocks(config.home.blocks, { isMember: false, features }).filter(
      (block) => block.type === 'quickActions',
    )
    expect(actions).toMatchObject({ actions: ['pickup'] })

    const none = { ...config.features, orderModes: { pickup: false, delivery: false, dineIn: false } }
    expect(ids(visibleBlocks(config.home.blocks, { isMember: false, features: none }))).not.toContain('actions')
  })

  it('drops a banner carousel with no banners', () => {
    const blocks: AppHomeBlock[] = [
      { id: 'empty', type: 'bannerCarousel', visibleWhen: 'always', format: 'square', autoplay: false, banners: [] },
    ]
    expect(visibleBlocks(blocks, { isMember: false, features: config.features })).toEqual([])
  })
})

describe('resolveFeaturedItems', () => {
  it('uses the featured flag, available items first', () => {
    const block = { source: 'featured' as const, itemIds: [] }
    expect(resolveFeaturedItems(block, catalog.items).map((item) => item.id)).toEqual([
      'item-latte',
      'item-sea-salt',
      'item-cold-brew',
    ])
  })

  it('keeps manual order and skips items no longer on the menu', () => {
    const block = { source: 'manual' as const, itemIds: ['item-croissant', 'gone', 'item-latte'] }
    expect(resolveFeaturedItems(block, catalog.items).map((item) => item.id)).toEqual(['item-croissant', 'item-latte'])
  })
})
