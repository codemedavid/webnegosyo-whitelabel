'use client'

/**
 * Visual pickers for the Branding Studio's card template and page layout.
 *
 * Card tiles render the REAL card component with the merchant's own dish and
 * current (draft) colors, scaled down, so a merchant compares designs on their
 * menu rather than on a stock photo. Layout tiles are drawn wireframes in the
 * brand color — a live render of a whole menu page per tile would be too heavy.
 */

import { memo, type ReactNode } from 'react'
import { CardTemplateRenderer } from '@/components/customer/card-templates'
import { CARD_TEMPLATES, type CardTemplate } from '@/lib/card-templates'
import { PAGE_LAYOUTS, type PageLayout } from '@/lib/page-layouts'
import type { BrandingColors } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

/** Width the card is laid out at before being scaled into its tile. */
const CARD_RENDER_WIDTH = 220
const CARD_TILE_WIDTH = 142
const CARD_SCALE = CARD_TILE_WIDTH / CARD_RENDER_WIDTH

export interface GalleryContext {
  sampleItem: MenuItem
  branding: BrandingColors
}

interface GalleryProps {
  value: unknown
  onChange: (value: string) => void
  label: string
}

interface TileProps {
  isActive: boolean
  onClick: () => void
  name: string
  caption: string
  children: ReactNode
}

function Tile({ isActive, onClick, name, caption, children }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] duration-150 ${
        isActive
          ? 'border-neutral-900 shadow-[0_0_0_1.5px_#171717]'
          : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      {children}
      <span className="border-t border-neutral-100 px-2.5 py-2">
        <span className="block text-[12px] font-bold leading-tight text-neutral-900">{name}</span>
        <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-snug text-neutral-500">{caption}</span>
      </span>
    </button>
  )
}

const FLEXIBLE_IDS = new Set<CardTemplate>(CARD_TEMPLATES.filter((t) => t.isFlexible).map((t) => t.id))

/**
 * What a preview actually depends on. The Studio rebuilds its branding object
 * on every edit, so identity is useless; the fixed designs also ignore the
 * card-style knobs, so dialing a knob redraws only the six flexible tiles.
 */
function previewKey(template: CardTemplate, branding: BrandingColors): string {
  return JSON.stringify(FLEXIBLE_IDS.has(template) ? branding : { ...branding, cardStyle: undefined })
}

interface CardPreviewProps {
  template: CardTemplate
  context: GalleryContext
}

/** One card template drawn live at small scale; inert so it never steals clicks. */
const CardPreview = memo(function CardPreview({ template, context }: CardPreviewProps) {
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none relative h-[190px] overflow-hidden"
      style={{ backgroundColor: context.branding.background }}
    >
      <div
        className="absolute left-1/2 top-3 origin-top"
        style={{ width: CARD_RENDER_WIDTH, transform: `translateX(-50%) scale(${CARD_SCALE})` }}
      >
        <CardTemplateRenderer template={template} item={context.sampleItem} onSelect={() => undefined} branding={context.branding} />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-8"
        style={{ background: `linear-gradient(to top, ${context.branding.background}, transparent)` }}
      />
    </div>
  )
}, (prev: CardPreviewProps, next: CardPreviewProps) =>
  prev.template === next.template &&
  prev.context.sampleItem === next.context.sampleItem &&
  previewKey(prev.template, prev.context.branding) === previewKey(next.template, next.context.branding))

export function CardTemplateGallery({ value, onChange, label, context }: GalleryProps & { context: GalleryContext }) {
  const flexible = CARD_TEMPLATES.filter((t) => t.isFlexible)
  const classic = CARD_TEMPLATES.filter((t) => !t.isFlexible)
  const renderGroup = (title: string, hint: string, templates: typeof CARD_TEMPLATES) => (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">{title}</span>
        <span className="text-[10.5px] text-neutral-400">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {templates.map((t) => (
          <Tile key={t.id} isActive={value === t.id} onClick={() => onChange(t.id)} name={t.name} caption={t.description}>
            <CardPreview template={t.id} context={context} />
          </Tile>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-2 text-[12.5px] font-semibold">{label}</div>
      <div className="flex flex-col gap-4">
        {renderGroup('Flexible', 'Tune in Card style', flexible)}
        {renderGroup('Classic set', 'Fixed designs', classic)}
      </div>
    </div>
  )
}

// ---------- layout wireframes ----------

interface WireProps {
  brand: string
}

const Bar = ({ className = '', color = '#e5e5e5' }: { className?: string; color?: string }) => (
  <div className={`rounded-[3px] ${className}`} style={{ backgroundColor: color }} />
)

/** A tiny product card: photo block + title line. */
const Cell = ({ brand, tall = false, filled = false }: WireProps & { tall?: boolean; filled?: boolean }) => (
  <div className="flex flex-col gap-[3px]">
    <div className={`rounded-[3px] ${tall ? 'h-[30px]' : 'h-[20px]'}`} style={{ backgroundColor: filled ? brand : '#d4d4d4' }} />
    <Bar className="h-[3px] w-3/4" />
  </div>
)

const Grid = ({ brand, cols, count, filled = false }: WireProps & { cols: number; count: number; filled?: boolean }) => (
  <div className="grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {Array.from({ length: count }, (_, i) => <Cell key={i} brand={brand} filled={filled} />)}
  </div>
)

const Chips = ({ brand, count = 4 }: WireProps & { count?: number }) => (
  <div className="flex gap-[3px]">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="h-[6px] w-[16px] rounded-full" style={{ backgroundColor: i === 0 ? brand : '#e5e5e5' }} />
    ))}
  </div>
)

const WIREFRAMES: Record<PageLayout, (props: WireProps) => ReactNode> = {
  default: ({ brand }) => (
    <>
      <Bar className="h-[22px]" color={`color-mix(in srgb, ${brand} 20%, white)`} />
      <Chips brand={brand} />
      <Grid brand={brand} cols={3} count={6} />
    </>
  ),
  sidebar: ({ brand }) => (
    <div className="flex gap-[5px]">
      <div className="flex w-[14px] flex-col gap-[4px]">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[12px] rounded-full" style={{ backgroundColor: i === 0 ? brand : '#e5e5e5' }} />)}
      </div>
      <div className="flex-1"><Grid brand={brand} cols={2} count={6} /></div>
    </div>
  ),
  magazine: ({ brand }) => (
    <>
      <div className="h-[40px] rounded-[3px]" style={{ backgroundColor: brand }} />
      <Grid brand={brand} cols={2} count={4} />
    </>
  ),
  'grid-focus': ({ brand }) => <Grid brand={brand} cols={3} count={9} />,
  list: () => (
    <div className="flex flex-col gap-[5px]">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-[4px]">
          <div className="h-[12px] w-[12px] shrink-0 rounded-[3px] bg-neutral-300" />
          <Bar className="h-[3px] flex-1" />
        </div>
      ))}
    </div>
  ),
  mosaic: () => (
    <div className="grid grid-cols-3 gap-[4px]">
      {[26, 16, 34, 20, 30, 14].map((h, i) => <div key={i} className="rounded-[3px] bg-neutral-300" style={{ height: h }} />)}
    </div>
  ),
  storefront: ({ brand }) => (
    <>
      <Chips brand={brand} count={5} />
      <Bar className="h-[6px] w-1/2" color="#a3a3a3" />
      <Grid brand={brand} cols={4} count={8} />
    </>
  ),
  kiosk: ({ brand }) => (
    <div className="flex gap-[5px]">
      <div className="flex w-[16px] flex-col gap-[5px]">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[16px] rounded-full" style={{ backgroundColor: i === 0 ? brand : '#e5e5e5' }} />)}
      </div>
      <div className="flex flex-1 flex-col gap-[4px]">
        <Bar className="h-[8px] w-2/3" color="#525252" />
        <Grid brand={brand} cols={3} count={6} filled />
      </div>
    </div>
  ),
  rails: ({ brand }) => (
    <>
      <div className="flex gap-[4px] overflow-hidden">
        {[0, 1].map((i) => <div key={i} className="h-[30px] w-[60%] shrink-0 rounded-[3px]" style={{ backgroundColor: i === 0 ? brand : '#d4d4d4' }} />)}
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-[3px]">
          <Bar className="h-[4px] w-1/3" color="#a3a3a3" />
          <div className="flex gap-[4px] overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[16px] w-[30%] shrink-0 rounded-[3px] bg-neutral-300" />)}
          </div>
        </div>
      ))}
    </>
  ),
  lookbook: ({ brand }) => (
    <>
      <div className="relative h-[36px] rounded-[3px]" style={{ backgroundColor: brand }}>
        <div className="absolute bottom-[5px] left-[5px] h-[5px] w-[40%] rounded-[2px] bg-white/85" />
      </div>
      <div className="grid grid-cols-2 gap-[4px]">
        <div className="h-[34px] rounded-[3px] bg-neutral-300" />
        <div className="grid grid-cols-2 gap-[3px]">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="rounded-[2px] bg-neutral-300" />)}
        </div>
      </div>
    </>
  ),
}

export function PageLayoutGallery({ value, onChange, label, brand }: GalleryProps & { brand: string }) {
  return (
    <div>
      <div className="mb-2 text-[12.5px] font-semibold">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {PAGE_LAYOUTS.map((layout) => {
          const Wireframe = WIREFRAMES[layout.id]
          return (
            <Tile
              key={layout.id}
              isActive={value === layout.id}
              onClick={() => onChange(layout.id)}
              name={layout.name}
              caption={layout.description}
            >
              <div aria-hidden className="flex h-[112px] flex-col gap-[5px] overflow-hidden bg-neutral-50 p-2.5">
                <Wireframe brand={brand} />
              </div>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}
