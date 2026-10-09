import { v4 as uuidv4 } from 'uuid'

import { DESIGN_VERSION } from './constants'
import type {
  Column,
  HeroDesignV5,
  NodeStyle,
  Section,
  Theme,
  Widget,
  WidgetContent,
  WidgetKind,
} from './types'

export function newId(): string {
  return uuidv4()
}

export const DEFAULT_THEME: Theme = {
  colors: {},
  headingFont: '',
  bodyFont: '',
  buttonRadius: 10,
}

export function createBlankDesign(): HeroDesignV5 {
  return { version: DESIGN_VERSION, theme: { ...DEFAULT_THEME, colors: {} }, sections: [] }
}

interface WidgetDefaults {
  label: string
  content: () => WidgetContent
  style: NodeStyle
  mobile?: NodeStyle
}

const inFuture = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

export const WIDGET_DEFAULTS: Record<WidgetKind, WidgetDefaults> = {
  heading: {
    label: 'Heading',
    content: () => ({ kind: 'heading', text: 'Your headline goes here', tag: 'h2' }),
    style: { fontFamily: 'heading', fontSize: 44, fontWeight: 700, lineHeight: 1.1, color: '@text' },
    mobile: { fontSize: 32 },
  },
  text: {
    label: 'Text',
    content: () => ({
      kind: 'text',
      text: 'Tell customers what makes you special. Use **bold**, *italic* and [links](https://example.com).',
    }),
    style: { fontSize: 18, lineHeight: 1.6, color: '@muted' },
    mobile: { fontSize: 16 },
  },
  buttons: {
    label: 'Buttons',
    content: () => ({
      kind: 'buttons',
      items: [{ id: newId(), label: 'Order now', href: '#storefront-menu', newTab: false, variant: 'solid' }],
    }),
    style: { fontSize: 16 },
  },
  image: {
    label: 'Image',
    content: () => ({ kind: 'image', src: '', alt: '' }),
    style: { radius: 16, aspectRatio: '4/3', objectFit: 'cover' },
  },
  video: {
    label: 'Video',
    content: () => ({ kind: 'video', url: '', autoplay: false, muted: true, loop: false, controls: true }),
    style: { radius: 16, aspectRatio: '16/9' },
  },
  icon: {
    label: 'Icon',
    content: () => ({ kind: 'icon', name: 'Star' }),
    style: { size: 40, color: '@primary', textAlign: 'center' },
  },
  'icon-list': {
    label: 'Icon list',
    content: () => ({
      kind: 'icon-list',
      layout: 'vertical',
      items: [
        { id: newId(), icon: 'Check', text: 'Freshly made to order' },
        { id: newId(), icon: 'Check', text: 'Fast pickup & delivery' },
        { id: newId(), icon: 'Check', text: 'Pay online or on pickup' },
      ],
    }),
    style: { fontSize: 16, color: '@text', accentColor: '@primary' },
  },
  badge: {
    label: 'Badge',
    content: () => ({ kind: 'badge', text: 'New this week', icon: 'Sparkles' }),
    style: {
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: '@primary',
      background: { type: 'color', color: '@surface' },
      padding: { top: 6, right: 14, bottom: 6, left: 14 },
      radius: 999,
    },
  },
  countdown: {
    label: 'Countdown',
    content: () => ({ kind: 'countdown', target: inFuture(3), showLabels: true, expiredText: 'This offer has ended' }),
    style: { fontSize: 18 },
  },
  divider: {
    label: 'Divider',
    content: () => ({ kind: 'divider', lineStyle: 'solid' }),
    style: { size: 1, accentColor: '@muted', margin: { top: 8, right: 0, bottom: 8, left: 0 } },
  },
  spacer: {
    label: 'Spacer',
    content: () => ({ kind: 'spacer' }),
    style: { size: 40 },
    mobile: { size: 24 },
  },
  gallery: {
    label: 'Gallery',
    content: () => ({ kind: 'gallery', images: [] }),
    style: { columns: 3, gap: 12, radius: 12, aspectRatio: '1/1', objectFit: 'cover' },
    mobile: { columns: 2 },
  },
  html: {
    label: 'HTML & CSS',
    content: () => ({
      kind: 'html',
      html: '<style>\n  .promo { padding: 24px; border-radius: 16px; background: #fff7ed; }\n  .promo h3 { margin: 0 0 8px; }\n</style>\n<div class="promo">\n  <h3>Custom HTML</h3>\n  <p>Styles here only affect this block.</p>\n</div>',
    }),
    style: {},
  },
  embed: {
    label: 'Embed code',
    content: () => ({ kind: 'embed', code: '', height: 360, autoHeight: true }),
    style: {},
  },
  'order-entry': {
    label: 'How to order',
    content: () => ({
      kind: 'order-entry',
      layout: 'tiles',
      ctaLabel: 'Start ordering',
      ctaIcon: 'ArrowRight',
      showIcons: true,
      showBlurbs: true,
      labels: {},
      blurbs: {},
      icons: {},
    }),
    // Colours stay blank so tiles follow the theme surface and the start
    // button follows the theme primary (see the entry rules in base-css.ts).
    style: { fontSize: 15, radius: 18, gap: 12, size: 26 },
  },
  'store-logo': {
    label: 'Store logo',
    content: () => ({ kind: 'store-logo', fallback: 'name' }),
    style: { size: 88, textAlign: 'center', fontFamily: 'heading', fontSize: 28, fontWeight: 700, color: '@text' },
    mobile: { size: 72 },
  },
  slideshow: {
    label: 'Slideshow',
    content: () => ({ kind: 'slideshow', slides: [], autoplay: true, interval: 5, showDots: true }),
    style: { radius: 18, aspectRatio: '16/9', objectFit: 'cover', accentColor: '@text' },
  },
}

export function createWidget(kind: WidgetKind): Widget {
  const defaults = WIDGET_DEFAULTS[kind]
  return {
    id: newId(),
    kind,
    content: defaults.content(),
    style: structuredClone(defaults.style),
    ...(defaults.mobile ? { mobile: structuredClone(defaults.mobile) } : {}),
  }
}

export function createColumn(width: number, widgets: Widget[] = []): Column {
  return { id: newId(), style: { width }, widgets }
}

export const COLUMN_LAYOUTS: readonly { id: string; label: string; widths: number[] }[] = [
  { id: '1', label: '1 column', widths: [100] },
  { id: '1-1', label: '2 equal', widths: [50, 50] },
  { id: '2-1', label: '2 : 1', widths: [66, 34] },
  { id: '1-2', label: '1 : 2', widths: [34, 66] },
  { id: '1-1-1', label: '3 equal', widths: [33, 34, 33] },
  { id: '1-2-1', label: '1 : 2 : 1', widths: [25, 50, 25] },
  { id: '1-1-1-1', label: '4 equal', widths: [25, 25, 25, 25] },
]

export function createSection(widths: readonly number[] = [100], label = 'Section'): Section {
  return {
    id: newId(),
    label,
    style: {
      padding: { top: 72, right: 24, bottom: 72, left: 24 },
      contentWidth: 1200,
      gap: 32,
      align: 'center',
      background: { type: 'none' },
    },
    tablet: { padding: { top: 56, right: 24, bottom: 56, left: 24 } },
    mobile: { stack: true, gap: 24, padding: { top: 40, right: 16, bottom: 40, left: 16 } },
    columns: widths.map((w) => createColumn(w)),
  }
}

/** Deep copy with fresh ids, for duplicate / paste / preset insertion. */
export function cloneWithNewIds<T extends Section | Column | Widget>(node: T): T {
  const copy = structuredClone(node) as T
  const refresh = (n: { id: string }) => {
    n.id = newId()
  }
  refresh(copy)
  if ('columns' in copy) {
    for (const column of copy.columns) {
      refresh(column)
      column.widgets.forEach(refreshWidget)
    }
  } else if ('widgets' in copy) {
    copy.widgets.forEach(refreshWidget)
  } else {
    refreshWidget(copy as Widget)
  }
  return copy

  function refreshWidget(w: Widget) {
    refresh(w)
    const c = w.content
    if (c.kind === 'buttons') c.items.forEach(refresh)
    if (c.kind === 'icon-list') c.items.forEach(refresh)
    if (c.kind === 'gallery') c.images.forEach(refresh)
    if (c.kind === 'slideshow') c.slides.forEach(refresh)
  }
}
