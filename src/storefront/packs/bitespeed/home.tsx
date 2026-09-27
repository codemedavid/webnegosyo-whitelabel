'use client'

import { useMemo } from 'react'
import { readPackSettings } from '@/lib/storefront-packs'
import { selectBestSellers } from '../../catalog/best-sellers'
import { StorefrontBottomInset, useStorefrontRuntime } from '../../runtime/storefront-runtime'
import { BITESPEED_TAB_BAR_PX, BiteSpeedHeader, BiteSpeedTabBar } from './chrome'
import { BiteSpeedBestSellers, BiteSpeedHero, BiteSpeedHowItWorks, BiteSpeedPromoTiles } from './home-sections'
import { BiteSpeedRoot } from './parts'

/**
 * BiteSpeed home: hero, deals, best sellers and "how it works", with the
 * page links in the header on desktop and in a tab bar on phones.
 */
export function BiteSpeedHome() {
  const { menu } = useStorefrontRuntime()
  const { tenant, allMenuItems } = menu
  const settings = useMemo(() => readPackSettings(tenant, 'bitespeed'), [tenant])
  const bestSellers = useMemo(
    () => selectBestSellers(allMenuItems, { menuEngineeringEnabled: tenant?.menu_engineering_enabled }),
    [allMenuItems, tenant?.menu_engineering_enabled]
  )

  return (
    <BiteSpeedRoot>
      <StorefrontBottomInset mobilePx={BITESPEED_TAB_BAR_PX} />
      <BiteSpeedHeader active="home" />
      <main className="flex flex-col gap-12 pb-12">
        <BiteSpeedHero settings={settings} fallbackImage={bestSellers.find((item) => item.image_url)?.image_url} />
        <BiteSpeedPromoTiles />
        <BiteSpeedBestSellers items={bestSellers} settings={settings} />
        <BiteSpeedHowItWorks settings={settings} />
      </main>
      <BiteSpeedTabBar active="home" />
    </BiteSpeedRoot>
  )
}
