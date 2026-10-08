'use client'

import { useCallback, useRef, useState } from 'react'
import { Search, ShoppingCart, Star } from 'lucide-react'
import { STORE_LOOKS, STORE_TYPES, type StoreLook, type StoreType } from '@/lib/onboarding/store-type'
import { storePalette, type StorePalette } from './onboarding-theme'
import type { PreviewMenuRow } from './preview-menu'

/**
 * A phone showing the store as it is being described, laid out like the real
 * storefront (top bar, text hero, search, category tabs, then the menu in the
 * chosen look) in the merchant's colors from the same palette function the
 * build uses. Once the store exists, `LiveStoreFrame` shows the real thing.
 */

const SKELETON_ROWS = 4
const STATUS_BAR_PX = 44
const TILE_COUNT = 4

export interface StorePreviewProps {
  storeName: string
  tagline: string
  storeType: StoreType | ''
  brand: string
  logoUrl: string | null
  rows: PreviewMenuRow[]
  look: StoreLook
}

export function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure
      aria-label={label}
      className="relative mx-auto aspect-[9/19.2] w-full max-w-[300px] rounded-[2.75rem] bg-[#1B1918] p-[9px] shadow-[0_50px_100px_-40px_rgba(23,19,15,0.45),0_24px_48px_-24px_rgba(23,19,15,0.35),inset_0_0_0_1.5px_rgba(255,255,255,0.09)]"
    >
      <div className="absolute left-1/2 top-[19px] z-20 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
      <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-white">{children}</div>
    </figure>
  )
}

/** The strip under the notch, so a screen never starts behind it. */
function StatusBar({ color = '#FFFFFF' }: { color?: string }) {
  return (
    <div className="flex shrink-0 items-start px-6 pt-[13px] text-[11px] font-semibold text-[#111]" style={{ height: STATUS_BAR_PX, backgroundColor: color }} aria-hidden>
      9:41
    </div>
  )
}

function Monogram({ name, palette }: { name: string; palette: StorePalette }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?'
  return (
    <span className="flex h-full w-full items-center justify-center text-[10px] font-extrabold" style={{ backgroundColor: palette.brand, color: palette.brandInk }}>
      {initials}
    </span>
  )
}

function Hero({ look, name, line, palette }: { look: StoreLook; name: string; line: string; palette: StorePalette }) {
  const hero = STORE_LOOKS[look].hero
  if (hero === 'banner') {
    return (
      <div className="mx-3 mt-2 rounded-2xl px-4 py-5 transition-colors duration-500" style={{ backgroundColor: palette.brand }}>
        <p className="line-clamp-2 text-[17px] font-extrabold leading-tight" style={{ color: palette.brandInk }}>{name}</p>
        <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: palette.brandInk }}>{line}</p>
      </div>
    )
  }
  if (hero === 'minimal') {
    return (
      <div className="px-4 pt-3">
        <p className="line-clamp-2 text-[17px] font-extrabold leading-tight" style={{ color: palette.text }}>{name}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: palette.textMuted }}>{line}</p>
      </div>
    )
  }
  return (
    <div className="px-5 pt-4 text-center">
      <p className="line-clamp-2 text-[21px] font-bold leading-tight tracking-tight" style={{ color: palette.text }}>{name}</p>
      <span className="mx-auto mt-2 block h-0.5 w-6 rounded-full transition-colors duration-500" style={{ backgroundColor: palette.brand }} />
      <p className="mx-auto mt-2 line-clamp-2 max-w-[85%] text-[11px]" style={{ color: palette.textMuted }}>{line}</p>
    </div>
  )
}

function Price({ row, palette }: { row: PreviewMenuRow; palette: StorePalette }) {
  return <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: palette.price }}>{row.price ? `₱${row.price}` : '₱—'}</span>
}

function Name({ row, palette }: { row: PreviewMenuRow; palette: StorePalette }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {row.isBestSeller && <Star className="h-2.5 w-2.5 shrink-0" style={{ color: palette.price, fill: palette.price }} aria-hidden />}
      <span className="truncate text-[11px] font-semibold" style={{ color: palette.text }}>{row.name}</span>
    </span>
  )
}

function BoardRows({ rows, palette }: { rows: PreviewMenuRow[]; palette: StorePalette }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={`${row.name}-${row.isBestSeller}`} className="flex items-baseline gap-1.5 border-b py-2" style={{ borderColor: palette.border }}>
          <Name row={row} palette={palette} />
          <span className="min-w-3 flex-1 border-b border-dotted" style={{ borderColor: palette.border }} />
          <Price row={row} palette={palette} />
        </li>
      ))}
    </ul>
  )
}

function CardRows({ rows, palette }: { rows: PreviewMenuRow[]; palette: StorePalette }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={`${row.name}-${row.isBestSeller}`} className="rounded-xl border px-3 py-2.5" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
          <span className="mb-1.5 block h-0.5 w-4 rounded-full" style={{ backgroundColor: palette.brand }} />
          <Name row={row} palette={palette} />
          <span className="mt-1 block"><Price row={row} palette={palette} /></span>
        </li>
      ))}
    </ul>
  )
}

function MenuBody({ look, rows, palette }: { look: StoreLook; rows: PreviewMenuRow[]; palette: StorePalette }) {
  if (rows.length === 0) {
    return (
      <ul className="space-y-3 pt-2" aria-hidden>
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
  if (look === 'chapters') {
    return (
      <>
        <div className="mb-2 flex h-20 items-end rounded-xl px-3 pb-2.5 transition-colors duration-500" style={{ backgroundColor: palette.brand }}>
          <span className="text-[15px] font-extrabold" style={{ color: palette.brandInk }}>Menu</span>
        </div>
        <BoardRows rows={rows} palette={palette} />
      </>
    )
  }
  if (look === 'tiles') {
    return (
      <>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {rows.slice(0, TILE_COUNT).map((row) => (
            <span key={row.name} className="flex aspect-square items-end rounded-lg p-1 text-[8px] font-bold leading-tight" style={{ backgroundColor: palette.background, color: palette.text }}>
              <span className="line-clamp-2">{row.name}</span>
            </span>
          ))}
        </div>
        <CardRows rows={rows} palette={palette} />
      </>
    )
  }
  if (look === 'cards') return <CardRows rows={rows} palette={palette} />
  return <BoardRows rows={rows} palette={palette} />
}

export function StorePreviewPhone({ storeName, tagline, storeType, brand, logoUrl, rows, look }: StorePreviewProps) {
  const palette = storePalette(brand, storeType, storeName)
  const name = storeName.trim() || 'Your store'
  const line = tagline.trim() || (storeType ? STORE_TYPES[storeType].heroLine : 'Order online in a few taps')

  return (
    <PhoneFrame label={`Preview of ${name}`}>
      <div className="flex h-full flex-col bg-white">
        <StatusBar />
        <div className="flex shrink-0 items-center gap-2 border-b px-3 pb-2.5" style={{ borderColor: palette.border }}>
          <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Monogram name={name} palette={palette} />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold" style={{ color: palette.text }}>{name}</span>
          <ShoppingCart className="h-4 w-4 shrink-0" style={{ color: palette.text }} aria-hidden />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden transition-colors duration-500" style={{ backgroundColor: palette.background }}>
          <Hero look={look} name={name} line={line} palette={palette} />
          <div className="mx-3 mt-3 flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5" style={{ borderColor: palette.border }}>
            <Search className="h-3 w-3" style={{ color: palette.textMuted }} aria-hidden />
            <span className="text-[10px]" style={{ color: palette.textMuted }}>Search the menu</span>
          </div>
          <div className="mt-2.5 flex gap-1.5 px-3">
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors duration-500" style={{ backgroundColor: palette.button, color: palette.buttonInk }}>All items</span>
            <span className="rounded-full border bg-white px-2.5 py-1 text-[10px] font-semibold" style={{ borderColor: palette.border, color: palette.text }}>Best sellers</span>
          </div>
          <div className="px-3 pt-3">
            <MenuBody look={look} rows={rows} palette={palette} />
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}

/** Real phones are at least this wide; the store is laid out at it, then scaled to the frame. */
const DEVICE_WIDTH_PX = 390

/** The frame's width, so the store can render at phone width and scale down to fit. */
function useScaleToFit(): [React.RefCallback<HTMLDivElement>, number] {
  const [scale, setScale] = useState(1)
  const observerRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    if (!node) return
    const measure = () => setScale(node.clientWidth > 0 ? node.clientWidth / DEVICE_WIDTH_PX : 1)
    measure()
    observerRef.current = new ResizeObserver(measure)
    observerRef.current.observe(node)
  }, [])
  return [ref, scale]
}

/**
 * The real storefront inside the phone, once the store exists. The page is
 * laid out at a real phone's width and scaled to the frame, so it looks the
 * way customers will see it (a 270px viewport would wrap and clip it).
 * `version` re-mounts the frame so each finished build step shows up; until
 * the page loads, a skeleton holds the screen. It starts under a status bar,
 * never behind the notch.
 */
export function LiveStoreFrame({ path, title, version = 0 }: { path: string; title: string; version?: number }) {
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null)
  const [screenRef, scale] = useScaleToFit()
  const isLoaded = loadedVersion === version
  return (
    <PhoneFrame label={title}>
      <div className="flex h-full flex-col">
        <StatusBar />
        <div ref={screenRef} className="relative min-h-0 flex-1 overflow-hidden">
          <iframe key={version} src={path} title={title} onLoad={() => setLoadedVersion(version)} loading="lazy"
            className={`absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ width: DEVICE_WIDTH_PX, height: `${100 / scale}%`, transform: `scale(${scale})` }} />
          {!isLoaded && <PhoneSkeleton />}
        </div>
      </div>
    </PhoneFrame>
  )
}

/** Placeholder screen: a hero block and menu rows, gently pulsing. */
export function PhoneSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col gap-3 bg-white p-4 pt-14" aria-hidden>
      <div className="h-28 animate-pulse rounded-2xl bg-[#E9E4DE] motion-reduce:animate-none" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="h-3 animate-pulse rounded-full bg-[#E9E4DE] motion-reduce:animate-none" style={{ width: `${62 - index * 6}%` }} />
          <span className="ml-auto h-3 w-10 animate-pulse rounded-full bg-[#E9E4DE] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}
