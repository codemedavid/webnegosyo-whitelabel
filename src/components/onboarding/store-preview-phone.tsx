'use client'

import { useState } from 'react'
import { ShoppingBag, Star } from 'lucide-react'
import type { OnboardingOrderType } from '@/lib/onboarding/answers'
import { STORE_TYPES, type StoreType } from '@/lib/onboarding/store-type'
import { storePalette } from './onboarding-theme'
import type { PreviewMenuRow } from './preview-menu'

/**
 * A phone showing the store as it is being described: the merchant's colors
 * (through the same palette function the build uses), logo, name, tagline and
 * the dishes typed so far. Before a store exists this is the only preview;
 * once it does, `LiveStoreFrame` shows the real storefront instead.
 */

const ORDER_TYPE_LABELS: Record<OnboardingOrderType, string> = {
  dine_in: 'Dine-in',
  pickup: 'Pickup',
  delivery: 'Delivery',
}

const SKELETON_ROWS = 4

export interface StorePreviewProps {
  storeName: string
  tagline: string
  storeType: StoreType | ''
  brand: string
  logoUrl: string | null
  rows: PreviewMenuRow[]
  orderTypes: OnboardingOrderType[]
}

export function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure
      aria-label={label}
      className="relative mx-auto aspect-[9/19.2] w-full max-w-[300px] rounded-[2.75rem] bg-[#1B1918] p-[9px] shadow-[0_50px_100px_-40px_rgba(23,19,15,0.45),0_24px_48px_-24px_rgba(23,19,15,0.35),inset_0_0_0_1.5px_rgba(255,255,255,0.09)]"
    >
      <div className="absolute left-1/2 top-[19px] z-10 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
      <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-white">{children}</div>
    </figure>
  )
}

function Monogram({ name, color, ink }: { name: string; color: string; ink: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?'
  return (
    <span className="flex h-full w-full items-center justify-center text-lg font-extrabold" style={{ backgroundColor: color, color: ink }}>
      {initials}
    </span>
  )
}

function MenuRows({ rows, palette }: { rows: PreviewMenuRow[]; palette: ReturnType<typeof storePalette> }) {
  if (rows.length === 0) {
    return (
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="h-2.5 rounded-full" style={{ width: `${55 - index * 8}%`, backgroundColor: palette.border }} />
            <span className="flex-1 border-b border-dotted" style={{ borderColor: palette.border }} />
            <span className="h-2.5 w-8 rounded-full" style={{ backgroundColor: palette.border }} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={`${row.name}-${row.isBestSeller}`} className="flex items-baseline gap-1.5 text-[11px]">
          {row.isBestSeller && <Star className="h-2.5 w-2.5 shrink-0 self-center" style={{ color: palette.price, fill: palette.price }} aria-hidden />}
          <span className="truncate font-semibold" style={{ color: palette.text }}>{row.name}</span>
          <span className="min-w-3 flex-1 border-b border-dotted" style={{ borderColor: palette.border }} />
          <span className="shrink-0 font-bold tabular-nums" style={{ color: palette.price }}>{row.price ? `₱${row.price}` : '₱—'}</span>
        </li>
      ))}
    </ul>
  )
}

export function StorePreviewPhone({ storeName, tagline, storeType, brand, logoUrl, rows, orderTypes }: StorePreviewProps) {
  const palette = storePalette(brand, storeType, storeName)
  const name = storeName.trim() || 'Your store'
  const heroLine = tagline.trim() || (storeType ? STORE_TYPES[storeType].heroLine : 'Order online in a few taps')

  return (
    <PhoneFrame label={`Preview of ${name}`}>
      <div className="flex h-full flex-col transition-colors duration-500" style={{ backgroundColor: palette.background }}>
        <div className="px-4 pb-5 pt-12 text-center transition-colors duration-500" style={{ backgroundColor: palette.brand }}>
          <div className="mx-auto h-14 w-14 overflow-hidden rounded-2xl bg-white shadow-md ring-2 ring-white/70">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <Monogram name={name} color={palette.button} ink={palette.buttonInk} />
            )}
          </div>
          <p className="mt-2.5 truncate text-[15px] font-extrabold" style={{ color: palette.brandInk }}>{name}</p>
          <p className="mx-auto mt-0.5 line-clamp-2 max-w-[85%] text-[10px] opacity-85" style={{ color: palette.brandInk }}>{heroLine}</p>
        </div>

        <div className="flex gap-1.5 overflow-hidden px-3 pt-3">
          {(orderTypes.length > 0 ? orderTypes : (['pickup'] as OnboardingOrderType[])).map((type, index) => (
            <span
              key={type}
              className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={index === 0
                ? { backgroundColor: palette.button, color: palette.buttonInk }
                : { backgroundColor: palette.surface, color: palette.text, border: `1px solid ${palette.border}` }}
            >
              {ORDER_TYPE_LABELS[type]}
            </span>
          ))}
        </div>

        <div className="m-3 flex-1 overflow-hidden rounded-2xl p-3.5" style={{ backgroundColor: palette.surface, border: `1px solid ${palette.border}` }}>
          <p className="mb-3 text-[13px] font-bold" style={{ color: palette.text }}>Menu</p>
          <MenuRows rows={rows} palette={palette} />
        </div>

        <div className="px-3 pb-4">
          <div className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[11px] font-bold" style={{ backgroundColor: palette.button, color: palette.buttonInk }}>
            <ShoppingBag className="h-3 w-3" aria-hidden /> View cart
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}

/**
 * The real storefront inside the phone, once the store exists. `version`
 * re-mounts the frame so each finished build step shows up; until the page has
 * loaded, a quiet skeleton holds the screen instead of a blank white phone.
 */
export function LiveStoreFrame({ path, title, version = 0 }: { path: string; title: string; version?: number }) {
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null)
  const isLoaded = loadedVersion === version
  return (
    <PhoneFrame label={title}>
      <iframe key={version} src={path} title={title} onLoad={() => setLoadedVersion(version)}
        className={`h-full w-full border-0 transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} loading="lazy" />
      {!isLoaded && <PhoneSkeleton />}
    </PhoneFrame>
  )
}

/** Placeholder screen: a hero block and menu rows, gently pulsing. */
export function PhoneSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col gap-3 bg-white p-4 pt-14" aria-hidden>
      <div className="h-28 animate-pulse rounded-2xl bg-[#F6F4F1] motion-reduce:animate-none" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="h-3 animate-pulse rounded-full bg-[#F6F4F1] motion-reduce:animate-none" style={{ width: `${62 - index * 6}%` }} />
          <span className="ml-auto h-3 w-10 animate-pulse rounded-full bg-[#F6F4F1] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}
