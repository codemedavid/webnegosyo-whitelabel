import { buildDesignCss } from '@/lib/hero-builder/css'
import { createWidget } from '@/lib/hero-builder/defaults'
import { resolveEntryCtaLabel, resolveEntryLayout, resolveEntryOption } from '@/lib/hero-builder/entry-copy'
import { linkTargetHref, parseLinkTarget } from '@/lib/hero-builder/link-target'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import type { Widget } from '@/lib/hero-builder/types'

import { column, designOf, section } from '../hero-builder/helpers'

type EntryContent = Extract<Widget['content'], { kind: 'order-entry' }>

describe('welcome link targets', () => {
  it('round-trips start and per-order-type links', () => {
    expect(parseLinkTarget('#welcome-start')).toEqual({ type: 'welcome-start' })
    expect(parseLinkTarget('#welcome-mode-dine_in')).toEqual({ type: 'welcome-mode', mode: 'dine_in' })
    expect(linkTargetHref({ type: 'welcome-mode', mode: 'delivery' })).toBe('#welcome-mode-delivery')
    expect(linkTargetHref({ type: 'welcome-start' })).toBe('#welcome-start')
  })

  it('refuses an order type that does not exist', () => {
    expect(parseLinkTarget('#welcome-mode-teleport')).toEqual({ type: 'none' })
  })
})

describe('order-entry copy', () => {
  const blank: EntryContent = createWidget('order-entry').content as EntryContent

  it('falls back to defaults for blank labels, blurbs and icons', () => {
    expect(resolveEntryOption(blank, 'pickup')).toEqual({ mode: 'pickup', label: 'Pickup', blurb: 'Collect in store', icon: 'ShoppingBag' })
    expect(resolveEntryOption({ ...blank, labels: { pickup: '  ' } }, 'pickup').label).toBe('Pickup')
  })

  it('uses the merchant’s own words when given', () => {
    const custom = { ...blank, labels: { dine_in: 'Kain dito' }, blurbs: { dine_in: 'Upo ka muna' }, icons: { dine_in: 'Soup' } }
    expect(resolveEntryOption(custom, 'dine_in')).toMatchObject({ label: 'Kain dito', blurb: 'Upo ka muna', icon: 'Soup' })
  })

  it('ignores prototype keys smuggled in from stored JSON', () => {
    const hostile = { ...blank, labels: JSON.parse('{"__proto__": {"pickup": "pwned"}}') }
    expect(resolveEntryOption(hostile, 'pickup').label).toBe('Pickup')
  })

  it('becomes the start button when no order type is available', () => {
    expect(resolveEntryLayout({ layout: 'tiles' }, 0)).toBe('cta')
    expect(resolveEntryLayout({ layout: 'list' }, 2)).toBe('list')
    expect(resolveEntryLayout({ layout: 'cta' }, 3)).toBe('cta')
    expect(resolveEntryCtaLabel({ ctaLabel: '' })).toBe('Start ordering')
  })
})

describe('new blocks through schema, loader and stylesheet', () => {
  const widgets = [createWidget('order-entry'), createWidget('store-logo'), createWidget('slideshow')]
  const design = designOf([section('s', [column('c', widgets)])])

  it('validates and survives a save/load round trip', () => {
    expect(heroDesignV5Schema.safeParse(design).success).toBe(true)
    const loaded = loadHeroDesign(JSON.stringify(design))
    expect(loaded?.sections[0].columns[0].widgets.map((w) => w.kind)).toEqual(['order-entry', 'store-logo', 'slideshow'])
  })

  it('refuses unknown order types in per-type copy and out-of-range intervals', () => {
    // Deliberately malformed, as a hand-edited row could be.
    const entry = { ...widgets[0], content: { ...(widgets[0].content as EntryContent), labels: { teleport: 'x' } } } as unknown as Widget
    expect(heroDesignV5Schema.safeParse(designOf([section('s', [column('c', [entry])])])).success).toBe(false)
    const slides = { ...widgets[2], content: { ...(widgets[2].content as Extract<Widget['content'], { kind: 'slideshow' }>), interval: 999 } }
    expect(heroDesignV5Schema.safeParse(designOf([section('s', [column('c', [slides])])])).success).toBe(false)
  })

  it('writes tile colours, radius and logo height as scoped variables', () => {
    const styled = designOf([
      section('s', [
        column('c', [
          { ...widgets[0], style: { accentColor: '#112233', accentTextColor: '@text', radius: 4, size: 30 } },
          { ...widgets[1], style: { size: 120 } },
        ]),
      ]),
    ])
    const { css } = buildDesignCss(styled, { scope: 'hbtest' })
    expect(css).toContain('--hb-entry-bg:#112233')
    expect(css).toContain('--hb-entry-fg:var(--hb-text)')
    expect(css).toContain('--hb-entry-radius:4px')
    expect(css).toContain('--hb-logo-h:120px')
  })

  it('pins "fill the screen" to a fixed height for thumbnails only', () => {
    const tall = designOf([section('s', [column('c', [])], { style: { fullHeight: true } })])
    expect(buildDesignCss(tall, { scope: 'hbtest' }).css).toContain('min-height:100svh')
    expect(buildDesignCss(tall, { scope: 'hbtest', viewportHeight: 694 }).css).toContain('min-height:694px')
  })
})
