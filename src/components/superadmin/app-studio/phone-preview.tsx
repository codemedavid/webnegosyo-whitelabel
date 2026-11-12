'use client'

import { Gift, Home, QrCode, ShoppingBag, UserRound, UtensilsCrossed, Bike, Store, Repeat2, Megaphone } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { AppCatalog, AppConfig, AppHomeBlock, AppQuickAction } from '@/lib/app-contract'

/**
 * A look-alike of the customer app's Home, drawn on the web from the same
 * config the app receives. Schematic on purpose (a web page can't run the
 * native app): order, wording, colours and who sees what are right; exact
 * spacing and fonts are the simulator's job.
 */

const RADIUS: Record<AppConfig['theme']['corners'], number> = { sharp: 4, soft: 12, round: 20 }
const FONT: Record<AppConfig['theme']['fontKey'], string> = {
  jakarta: '"Plus Jakarta Sans", system-ui, sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  poppins: 'Poppins, system-ui, sans-serif',
  nunito: 'Nunito, system-ui, sans-serif',
  fraunces: 'Fraunces, Georgia, serif',
}
const ACTION_LABEL: Record<AppQuickAction, string> = { pickup: 'Pick up', delivery: 'Delivery', dineIn: 'Dine in', menu: 'Menu', rewards: 'Rewards', scan: 'Scan' }
const ACTION_ICON = { pickup: ShoppingBag, delivery: Bike, dineIn: UtensilsCrossed, menu: Store, rewards: Gift, scan: QrCode } as const

export type PreviewAudience = 'guest' | 'member'

interface PhonePreviewProps {
  config: AppConfig
  catalog: Pick<AppCatalog, 'categories' | 'items'>
  storeName: string
  logoUrl: string | null
  audience: PreviewAudience
  /** Highlights the block being edited. */
  selectedBlockId?: string | null
}

export function PhonePreview({ config, catalog, storeName, logoUrl, audience, selectedBlockId }: PhonePreviewProps) {
  const { colors, corners, fontKey } = config.theme
  const radius = RADIUS[corners]
  const blocks = config.home.blocks.filter((block) => block.visibleWhen === 'always' || block.visibleWhen === audience)
  return (
    <div className="mx-auto w-[300px] rounded-[44px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl" aria-label="App Home preview">
      <div className="relative h-[600px] overflow-hidden rounded-[34px]" style={{ background: colors.background, color: colors.text, fontFamily: FONT[fontKey] }}>
        <div className="h-full overflow-y-auto pb-16">
          <div className="px-4 pb-10 pt-8" style={{ background: colors.primary, color: colors.onPrimary }}>
            <div className="flex items-center gap-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the store's logo
                <img src={logoUrl} alt="" className="h-7 w-7 rounded-full bg-white object-cover" />
              ) : null}
              <span className="text-xs font-semibold opacity-80">{storeName}</span>
            </div>
            <p className="mt-3 text-xl font-extrabold leading-tight">
              {config.copy.greeting}
              {audience === 'member' ? ', Ana' : ''}
            </p>
          </div>
          <div className="-mt-6 space-y-3 px-3">
            {blocks.map((block) => (
              <div key={block.id} className={selectedBlockId === block.id ? 'rounded-xl outline outline-2 outline-offset-2 outline-sky-400' : undefined}>
                <Block block={block} config={config} catalog={catalog} radius={radius} audience={audience} />
              </div>
            ))}
            {blocks.length === 0 ? <p className="pt-10 text-center text-xs opacity-50">Nothing on Home for {audience === 'guest' ? 'guests' : 'members'}.</p> : null}
          </div>
        </div>
        <TabBar colors={colors} />
      </div>
    </div>
  )
}

function card(config: AppConfig, radius: number): CSSProperties {
  return { background: config.theme.colors.surface, borderRadius: radius, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
}

function Block({ block, config, catalog, radius, audience }: { block: AppHomeBlock; config: AppConfig; catalog: PhonePreviewProps['catalog']; radius: number; audience: PreviewAudience }) {
  const { colors } = config.theme
  switch (block.type) {
    case 'memberCard':
      return audience === 'member' ? (
        <div className="flex items-center gap-3 p-3" style={card(config, radius)}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold" style={{ border: `4px solid ${colors.primarySoft}` }}>
            3
          </div>
          <div className="text-[11px] leading-tight">
            <p className="font-bold" style={{ color: colors.primary }}>
              STAMP CARD
            </p>
            <p className="font-semibold">7 more stamps to your reward</p>
          </div>
        </div>
      ) : (
        <div className="p-3" style={card(config, radius)}>
          <p className="text-xs font-bold">{config.copy.guestJoinTitle}</p>
          <p className="mt-1 text-[11px] opacity-70">{config.copy.guestJoinBody}</p>
          <div className="mt-2 py-1.5 text-center text-[11px] font-bold" style={{ background: colors.primary, color: colors.onPrimary, borderRadius: 999 }}>
            Join or sign in
          </div>
        </div>
      )
    case 'announcement':
      return (
        <div className="flex items-start gap-2 p-2.5 text-[11px]" style={{ ...card(config, radius), background: block.tone === 'warning' ? '#fff4d6' : block.tone === 'promo' ? colors.primarySoft : colors.surfaceMuted }}>
          <Megaphone className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{block.text}</span>
        </div>
      )
    case 'bannerCarousel': {
      const first = block.banners[0]
      const aspect = block.format === 'square' ? '1 / 1' : block.format === 'portrait' ? '4 / 5' : '16 / 9'
      return (
        <div className="overflow-hidden" style={{ borderRadius: radius, aspectRatio: aspect, background: colors.surfaceMuted }}>
          {first ? (
            // eslint-disable-next-line @next/next/no-img-element -- a banner the store uploaded
            <img src={first.imageUrl} alt={first.title ?? ''} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] opacity-50">Add a banner</div>
          )}
        </div>
      )
    }
    case 'quickActions':
      return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${block.actions.length}, minmax(0, 1fr))` }}>
          {block.actions.map((action) => {
            const Icon = ACTION_ICON[action]
            return (
              <div key={action} className="p-2 text-[10px] font-semibold" style={card(config, radius)}>
                <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: colors.primarySoft, color: colors.onPrimarySoft }}>
                  <Icon className="h-3 w-3" />
                </div>
                {ACTION_LABEL[action]}
              </div>
            )
          })}
        </div>
      )
    case 'featuredItems': {
      // The app's own pick (visible-blocks.ts): manual keeps the order; no featured dish = available dishes with a photo.
      const featured = catalog.items.filter((item) => item.isFeatured)
      const shown = (
        block.source === 'manual'
          ? block.itemIds.flatMap((id) => catalog.items.filter((item) => item.id === id))
          : featured.length > 0
            ? featured
            : catalog.items.filter((item) => item.isAvailable && item.imageUrl !== null)
      ).slice(0, 3)
      return (
        <div>
          <p className="mb-1.5 text-xs font-bold">{block.title}</p>
          <div className="flex gap-2 overflow-hidden">
            {shown.map((item) => (
              <div key={item.id} className="w-24 shrink-0">
                <div className="aspect-square overflow-hidden" style={{ borderRadius: radius, background: colors.surfaceMuted }}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a dish photo
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[10px] font-semibold">{item.name}</p>
                <p className="text-[10px] opacity-70">₱{item.price.toLocaleString('en-PH')}</p>
              </div>
            ))}
          </div>
          {shown.length === 0 ? <p className="text-[10px] opacity-50">No dishes to show yet.</p> : null}
        </div>
      )
    }
    case 'categoriesRail':
      return (
        <div>
          <p className="mb-1.5 text-xs font-bold">{block.title}</p>
          <div className="flex gap-1.5 overflow-hidden">
            {catalog.categories.slice(0, 4).map((category) => (
              <span key={category.id} className="shrink-0 border px-2.5 py-1 text-[10px] font-semibold" style={{ borderColor: colors.border, borderRadius: 999 }}>
                {category.name}
              </span>
            ))}
          </div>
        </div>
      )
    case 'rewardsTeaser':
      return (
        <div className="p-3" style={{ ...card(config, radius), background: colors.accent, color: colors.onAccent }}>
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Gift className="h-3.5 w-3.5" /> {block.title}
          </p>
          <p className="mt-1 text-[11px] opacity-90">{block.body}</p>
        </div>
      )
    case 'orderAgain':
      return audience === 'member' ? (
        <div className="flex items-center gap-2 p-2.5 text-[11px]" style={card(config, radius)}>
          <Repeat2 className="h-3.5 w-3.5" style={{ color: colors.primary }} />
          <span className="font-bold">{block.title}</span>
          <span className="opacity-60">· your last order</span>
        </div>
      ) : null
  }
}

function TabBar({ colors }: { colors: AppConfig['theme']['colors'] }) {
  const tabs = [
    { label: 'Home', Icon: Home, isActive: true },
    { label: 'Order', Icon: UtensilsCrossed },
    { label: 'Scan', Icon: QrCode },
    { label: 'Rewards', Icon: Gift },
    { label: 'Account', Icon: UserRound },
  ]
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-around border-t py-2" style={{ background: colors.surface, borderColor: colors.border }}>
      {tabs.map(({ label, Icon, isActive }) => (
        <div key={label} className="flex flex-col items-center text-[9px] font-medium" style={{ color: isActive ? colors.primary : colors.text }}>
          <Icon className="h-4 w-4" />
          {label}
        </div>
      ))}
    </div>
  )
}
