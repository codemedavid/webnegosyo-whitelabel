// ---------------------------------------------------------------------------
// A welcome page stands between the customer and the menu, so it must ALWAYS
// offer a way in. "A way in" is a "How to order" block, or a button / image /
// slide that links to #welcome-start, #welcome-mode-<mode> or the menu,
// visible on that device. Publishing refuses a design without one on every device, and the
// storefront still appends a start button to any stored design that lacks one
// (hand-edited rows, older engines) — a customer is never trapped.
// ---------------------------------------------------------------------------

import { DEVICES } from '@/lib/hero-builder/constants'
import { createSection, createWidget } from '@/lib/hero-builder/defaults'
import { isEntryTarget, parseLinkTarget } from '@/lib/hero-builder/link-target'
import { resolveStyle } from '@/lib/hero-builder/resolve'
import type { Device, HeroDesignV5, Widget } from '@/lib/hero-builder/types'

/**
 * Links that start an order from the welcome page. Menu, category and product
 * links count too: before a branch is chosen there is no menu to jump into,
 * so the welcome page treats them as "start ordering" (see welcome-page.tsx).
 */
const STARTS_AN_ORDER = new Set(['menu', 'category', 'product'])
const isEntryHref = (href: unknown): boolean => {
  const target = parseLinkTarget(href)
  return isEntryTarget(target) || STARTS_AN_ORDER.has(target.type)
}

/** True when this widget, on its own, lets a customer start an order. */
export function isEntryWidget(widget: Widget): boolean {
  const c = widget.content
  switch (c.kind) {
    case 'order-entry':
      return true
    case 'buttons':
      return Array.isArray(c.items) && c.items.some((item) => isEntryHref(item.href))
    case 'image':
      return isEntryHref(c.href)
    case 'slideshow':
      return Array.isArray(c.slides) && c.slides.some((slide) => !!slide?.src && isEntryHref(slide.href))
    default:
      return false
  }
}

/** True when some visible element at `device` starts an order. */
export function hasEntryOn(design: HeroDesignV5, device: Device): boolean {
  return design.sections.some(
    (section) =>
      !resolveStyle(section, device).hidden &&
      section.columns.some(
        (column) =>
          !resolveStyle(column, device).hidden &&
          column.widgets.some((widget) => !resolveStyle(widget, device).hidden && isEntryWidget(widget)),
      ),
  )
}

/** The devices on which a customer would find no way in. */
export function devicesMissingEntry(design: HeroDesignV5): Device[] {
  return DEVICES.filter((device) => !hasEntryOn(design, device))
}

/** Stable ids, so the fallback never shifts React keys between renders. */
const FALLBACK_IDS = { section: 'welcome-fallback', column: 'welcome-fallback-col', widget: 'welcome-fallback-cta' }

/** The design, plus a start button wherever a device would have none. */
export function withGuaranteedEntry(design: HeroDesignV5): HeroDesignV5 {
  const missing = devicesMissingEntry(design)
  if (!missing.length) return design
  const widget = createWidget('order-entry')
  const cta: Widget = {
    ...widget,
    id: FALLBACK_IDS.widget,
    content: { ...(widget.content as Extract<Widget['content'], { kind: 'order-entry' }>), layout: 'cta' },
    style: { ...widget.style, align: 'stretch' },
  }
  const base = createSection([100], 'Start ordering')
  const section = {
    ...base,
    id: FALLBACK_IDS.section,
    // Shown only on the devices that need it, so it never doubles a real entry.
    style: { ...base.style, hidden: !missing.includes('desktop'), padding: { top: 24, right: 20, bottom: 40, left: 20 }, contentWidth: 560 },
    tablet: { hidden: !missing.includes('tablet') },
    mobile: { hidden: !missing.includes('mobile'), padding: { top: 16, right: 16, bottom: 32, left: 16 } },
    columns: [{ ...base.columns[0], id: FALLBACK_IDS.column, widgets: [cta] }],
  }
  return { ...design, sections: [...design.sections, section] }
}

const DEVICE_NAMES: Record<Device, string> = { desktop: 'computers', tablet: 'tablets', mobile: 'phones' }

/** A merchant-facing reason the design cannot be published, or null. */
export function entryProblem(design: HeroDesignV5): string | null {
  const missing = devicesMissingEntry(design)
  if (!missing.length) return null
  const where = missing.length === DEVICES.length ? '' : ` on ${missing.map((d) => DEVICE_NAMES[d]).join(' and ')}`
  return `Customers need a way to start ordering${where}. Add a "How to order" block, or link a button to "Start ordering".`
}
