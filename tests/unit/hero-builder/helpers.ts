import type { Column, HeroDesignV5, Section, Widget, WidgetKind } from '@/lib/hero-builder/types'

/** Recursively freezes a value so any in-place mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

export function designOf(sections: Section[], theme: Partial<HeroDesignV5['theme']> = {}): HeroDesignV5 {
  return {
    version: 5,
    theme: { colors: {}, headingFont: '', bodyFont: '', buttonRadius: 10, ...theme },
    sections,
  }
}

export function column(id: string, widgets: Widget[] = [], style: Column['style'] = { width: 100 }): Column {
  return { id, style, widgets }
}

export function section(id: string, columns: Column[], extra: Partial<Section> = {}): Section {
  return { id, label: id, style: {}, columns, ...extra }
}

export function spacer(id: string, extra: Partial<Widget> = {}): Widget {
  return { id, kind: 'spacer', content: { kind: 'spacer' }, style: {}, ...extra }
}

export const ALL_WIDGET_KINDS: readonly WidgetKind[] = [
  'heading', 'text', 'buttons', 'image', 'video', 'icon', 'icon-list',
  'badge', 'countdown', 'divider', 'spacer', 'gallery', 'html', 'embed',
  'order-entry', 'store-logo', 'slideshow',
]
