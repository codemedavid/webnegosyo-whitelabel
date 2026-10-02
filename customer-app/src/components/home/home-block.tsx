import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import type { AppBanner, AppCatalog, AppHomeBlock, AppQuickAction } from '@/lib/contract'
import { resolveFeaturedItems } from '@/lib/home/visible-blocks'
import { useCart, type OrderMode } from '@/lib/stores/cart'
import { Announcement } from './announcement'
import { BannerCarousel } from './banner-carousel'
import { CategoriesRail } from './categories-rail'
import { FeaturedRow } from './featured-row'
import { OrderAgain } from './order-again'
import { QuickActions } from './quick-actions'
import { RewardsTeaser } from './rewards-teaser'

const MODE_FOR_ACTION: Partial<Record<AppQuickAction, OrderMode>> = {
  pickup: 'pickup',
  delivery: 'delivery',
  dineIn: 'dineIn',
}

function openBanner(banner: AppBanner) {
  const action = banner.action ?? { type: 'none' as const }
  switch (action.type) {
    case 'item':
      router.push({ pathname: '/item/[id]', params: { id: action.itemId } })
      return
    case 'category':
      router.push({ pathname: '/order', params: { category: action.categoryId } })
      return
    case 'rewards':
      router.push('/rewards')
      return
    case 'url':
      void WebBrowser.openBrowserAsync(action.url)
      return
    case 'none':
      return
  }
}

interface HomeBlockProps {
  block: AppHomeBlock
  catalog: AppCatalog | undefined
}

/** One server-configured block. `memberCard` is rendered by the screen (it overlaps the header). */
export function HomeBlock({ block, catalog }: HomeBlockProps) {
  const setMode = useCart((state) => state.setMode)
  const onQuickAction = (action: AppQuickAction) => {
    const mode = MODE_FOR_ACTION[action]
    if (mode) setMode(mode)
    if (action === 'rewards') router.push('/rewards')
    else if (action === 'scan') router.push('/scan')
    else router.push('/order')
  }

  switch (block.type) {
    case 'memberCard':
      return null
    case 'bannerCarousel':
      return <BannerCarousel banners={block.banners} format={block.format} autoplay={block.autoplay} onBannerPress={openBanner} />
    case 'quickActions':
      return <QuickActions actions={block.actions} onAction={onQuickAction} />
    case 'featuredItems':
      return <FeaturedRow title={block.title} items={resolveFeaturedItems(block, catalog?.items ?? [])} />
    case 'categoriesRail':
      return <CategoriesRail title={block.title} categories={catalog?.categories ?? []} />
    case 'rewardsTeaser':
      return <RewardsTeaser title={block.title} body={block.body} />
    case 'announcement':
      return <Announcement text={block.text} tone={block.tone} />
    case 'orderAgain':
      return <OrderAgain title={block.title} />
  }
}
