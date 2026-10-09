// ---------------------------------------------------------------------------
// Builder kit for welcome-page templates, on top of the Hero Builder kit.
// Copy uses `{store}` (swapped for the store's name at render) and colours use
// theme refs (@primary, @text, …) unless a template needs a fixed palette.
// ---------------------------------------------------------------------------

import { WELCOME_START_ANCHOR, WELCOME_MODE_PREFIX } from '@/lib/hero-builder/link-target'
import { widget } from '@/lib/hero-builder/section-presets'
import type { EntryMode, NodeStyle, OrderEntryContent, Slide, Widget } from '@/lib/hero-builder/types'
import { newId } from '@/lib/hero-builder/defaults'

export const START_HREF = `#${WELCOME_START_ANCHOR}`
export const modeHref = (mode: EntryMode): string => `#${WELCOME_MODE_PREFIX}${mode}`

/** A narrow, centred reading column — the welcome page is phone-first. */
export const NARROW = 560

type EntryPatch = Partial<Omit<OrderEntryContent, 'kind'>>

export function entry(layout: OrderEntryContent['layout'], content: EntryPatch = {}, style: NodeStyle = {}, mobile?: NodeStyle): Widget {
  return widget('order-entry', { layout, ...content }, style, mobile)
}

/**
 * The store logo. Templates whose greeting already says `{store}` pass
 * `'none'`, so a store without a logo does not read its name twice.
 */
export function logo(style: NodeStyle = {}, mobile?: NodeStyle, fallback: 'name' | 'none' = 'name'): Widget {
  return widget('store-logo', { fallback }, style, mobile)
}

export function slide(src: string, title: string, caption = ''): Slide {
  return { id: newId(), src, alt: title, title, ...(caption ? { caption } : {}) }
}

export function slideshow(slides: Slide[], style: NodeStyle = {}, mobile?: NodeStyle): Widget {
  return widget('slideshow', { slides, autoplay: true, interval: 5, showDots: true }, style, mobile)
}

/** Glass tiles for photo backgrounds: translucent white with white text. */
export const GLASS_TILES: NodeStyle = {
  accentColor: 'rgba(255,255,255,0.14)',
  accentTextColor: '#ffffff',
  color: '#ffffff',
}
