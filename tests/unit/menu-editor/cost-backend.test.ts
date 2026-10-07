import { dishCostConvexUrl } from '@/lib/menu-editor/cost-backend'

describe('dishCostConvexUrl', () => {
  it('uses Convex for a store whose orders live on Convex', () => {
    expect(dishCostConvexUrl({ order_backend: 'convex', convex_deployment_url: 'https://a.convex.cloud' })).toBe('https://a.convex.cloud')
  })

  it('ignores a leftover Convex URL on a platform-pinned store', () => {
    expect(dishCostConvexUrl({ order_backend: 'platform', convex_deployment_url: 'https://stale.convex.cloud' })).toBeUndefined()
  })

  it('has no Convex URL for a plain platform store', () => {
    expect(dishCostConvexUrl({ order_backend: null, convex_deployment_url: null })).toBeUndefined()
  })
})
