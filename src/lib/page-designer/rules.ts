// ---------------------------------------------------------------------------
// What a page design must contain, checked twice:
//   - on publish (pageDesignProblem): unknown blocks, duplicates, texts too
//     long, kinds this page does not offer, and a required block missing or
//     hidden on any device are refused with a merchant-facing reason;
//   - on render (preparePageDesign): the stored design is cleaned the same
//     way and any missing required block is appended, so a hand-edited row
//     or a block added to the registry later never strands a customer.
// ---------------------------------------------------------------------------

import { DEVICES } from '@/lib/hero-builder/constants'
import { createSection } from '@/lib/hero-builder/defaults'
import { resolveStyle } from '@/lib/hero-builder/resolve'
import type { Device, HeroDesignV5, Section, Widget } from '@/lib/hero-builder/types'

import { pageBlockDef, requiredBlocks } from './blocks'
import { createPageBlock, isPageBlockWidget } from './design-blocks'
import { isValidOptionValue } from './knobs'
import { blockParts, isValidPartValue, partOfKey } from './parts'
import { PAGE_META } from './pages'
import type { PageBlockDef, PageId, PageNeeds } from './types'

const DEVICE_NAMES: Record<Device, string> = { desktop: 'computers', tablet: 'tablets', mobile: 'phones' }

/** A required block counts on a device only where it and its parents show. */
function visibleBlockIds(design: HeroDesignV5, device: Device): Set<string> {
  const ids = new Set<string>()
  for (const section of design.sections) {
    if (resolveStyle(section, device).hidden || section.showWhen?.length) continue
    for (const column of section.columns) {
      if (resolveStyle(column, device).hidden) continue
      for (const widget of column.widgets) {
        // A required block limited to some states would vanish in the others.
        if (resolveStyle(widget, device).hidden || widget.showWhen?.length) continue
        if (isPageBlockWidget(widget)) ids.add(widget.content.block)
      }
    }
  }
  return ids
}

/** Required blocks (and needed ones, given `needs`) a customer would not see, per device. */
export function missingRequiredBlocks(design: HeroDesignV5, page: PageId, needs: PageNeeds = {}): Map<Device, PageBlockDef[]> {
  const missing = new Map<Device, PageBlockDef[]>()
  const required = requiredBlocks(page, needs)
  for (const device of DEVICES) {
    const visible = visibleBlockIds(design, device)
    const absent = required.filter((def) => !visible.has(def.id))
    if (absent.length) missing.set(device, absent)
  }
  return missing
}

function widgetProblem(widget: Widget, page: PageId, seen: Set<string>): string | null {
  if (widget.kind !== 'page-block') {
    return PAGE_META[page].freeKinds.includes(widget.kind) ? null : `This page can't use that element (${widget.kind}). Remove it to publish.`
  }
  if (!isPageBlockWidget(widget)) return 'A page block is broken. Remove it to publish.'
  const def = pageBlockDef(page, widget.content.block)
  if (!def) return 'A block from another page slipped in. Remove it to publish.'
  if (seen.has(def.id)) return `"${def.label}" appears twice. Keep one.`
  seen.add(def.id)
  for (const [key, value] of Object.entries(widget.content.texts)) {
    const slot = def.texts.find((t) => t.key === key)
    if (!slot) return `"${def.label}" has wording it doesn't use. Reset the block's text.`
    if (value.length > slot.maxLength) return `"${def.label}" — ${slot.label} is too long (${slot.maxLength} characters max).`
  }
  const parts = new Set(blockParts(def).map((part) => part.id))
  for (const [key, value] of Object.entries(widget.content.options)) {
    const part = partOfKey(key)
    if (part) {
      if (!parts.has(part) || !isValidPartValue(key, value)) return `"${def.label}" has a style it can't use. Reset the block's style.`
      continue
    }
    const option = def.options.find((o) => o.key === key)
    if (!option) return `"${def.label}" has a setting it doesn't use. Reset the block.`
    if (!isValidOptionValue(option, value)) return `"${def.label}" — ${option.label} has an invalid value.`
  }
  return null
}

/**
 * Step-by-step / folding layouts count every section as a step on every
 * device, so a section hidden on one device would be an empty step there.
 */
function steppedSectionProblem(design: HeroDesignV5): string | null {
  const layout = design.page?.layout
  if (layout !== 'steps' && layout !== 'accordion') return null
  for (const section of design.sections) {
    if (section.pin === 'bottom') continue
    const hiddenOn = DEVICES.filter((device) => resolveStyle(section, device).hidden)
    if (hiddenOn.length) {
      const where = hiddenOn.map((d) => DEVICE_NAMES[d]).join(' and ')
      return `"${section.label || 'A section'}" is hidden on ${where}, so it would be an empty ${layout === 'steps' ? 'step' : 'panel'} there. Show it, or move its blocks and delete it.`
    }
  }
  return null
}

/** A merchant-facing reason this design cannot be published on `page`, or null. */
export function pageDesignProblem(design: HeroDesignV5, page: PageId): string | null {
  for (const [key, value] of Object.entries(design.page?.parts ?? {})) {
    if (!isValidPartValue(key, value)) return 'A page style has an invalid value. Reset the page style.'
  }
  const stepped = steppedSectionProblem(design)
  if (stepped) return stepped
  const seen = new Set<string>()
  for (const section of design.sections) {
    for (const column of section.columns) {
      for (const widget of column.widgets) {
        const problem = widgetProblem(widget, page, seen)
        if (problem) return problem
      }
    }
  }
  const missing = missingRequiredBlocks(design, page)
  if (!missing.size) return null
  const names = [...new Set([...missing.values()].flat().map((d) => `"${d.label}"`))].join(', ')
  const where = missing.size === DEVICES.length ? '' : ` on ${[...missing.keys()].map((d) => DEVICE_NAMES[d]).join(' and ')}`
  return `${names} must show${where} at all times — it keeps the page working. Unhide it or take it out of "Show when".`
}

const FALLBACK = { section: 'page-fallback', column: 'page-fallback-col' }

/** Drop what this page can't render: other pages' blocks, duplicates, kinds it doesn't offer. */
function cleanSections(sections: readonly Section[], page: PageId): Section[] {
  const seen = new Set<string>()
  const keep = (widget: Widget): boolean => {
    if (widget.kind !== 'page-block') return PAGE_META[page].freeKinds.includes(widget.kind)
    if (!isPageBlockWidget(widget)) return false
    const def = pageBlockDef(page, widget.content.block)
    if (!def || seen.has(def.id)) return false
    seen.add(def.id)
    return true
  }
  return sections.map((s) => ({ ...s, columns: s.columns.map((c) => ({ ...c, widgets: c.widgets.filter(keep) })) }))
}

const hasBlock = (design: HeroDesignV5, id: string) =>
  design.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => isPageBlockWidget(w) && w.content.block === id)))

/** Without an order summary on the page, the place-order button always shows the total. */
function withTotalOnButton(design: HeroDesignV5, page: PageId): HeroDesignV5 {
  if (page !== 'checkout' || hasBlock(design, 'checkout.summary')) return design
  return {
    ...design,
    sections: design.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) =>
          isPageBlockWidget(w) && w.content.block === 'checkout.place_order' ? { ...w, content: { ...w.content, options: { ...w.content.options, show_total: true } } } : w,
        ),
      })),
    })),
  }
}

/**
 * The stored design made safe to render on `page`: cleaned, plus a section
 * holding every required block a device would otherwise miss (shown only on
 * the devices that need it). `needs` (known in the browser, from the live
 * store) brings back removable blocks the order can't go without. Running it
 * again with more needs rebuilds that section, never doubles it.
 */
export function preparePageDesign(design: HeroDesignV5, page: PageId, needs: PageNeeds = {}): HeroDesignV5 {
  const own = design.sections.filter((s) => s.id !== FALLBACK.section)
  const cleaned: HeroDesignV5 = withTotalOnButton({ ...design, sections: cleanSections(own, page) }, page)
  const missing = missingRequiredBlocks(cleaned, page, needs)
  if (!missing.size) return cleaned
  const defs = [...new Map([...missing.values()].flat().map((d) => [d.id, d])).values()]
  const missingOn = (def: PageBlockDef, device: Device) => !!missing.get(device)?.some((d) => d.id === def.id)
  // Each fallback block shows only on the devices that lack it, so it never
  // doubles a block the owner placed.
  const widgets: Widget[] = defs.map((def) => {
    const widget = createPageBlock(def)
    return {
      ...widget,
      id: `page-fallback-${def.id.replace(/[^A-Za-z0-9_-]/g, '-')}`,
      style: { ...widget.style, hidden: !missingOn(def, 'desktop') },
      tablet: { hidden: !missingOn(def, 'tablet') },
      mobile: { hidden: !missingOn(def, 'mobile') },
    }
  })
  const base = createSection([100], 'Page essentials')
  const section: Section = {
    ...base,
    id: FALLBACK.section,
    style: { ...base.style, hidden: !missing.has('desktop'), padding: { top: 16, right: 16, bottom: 32, left: 16 }, contentWidth: 720 },
    tablet: { hidden: !missing.has('tablet') },
    mobile: { hidden: !missing.has('mobile'), padding: { top: 12, right: 12, bottom: 24, left: 12 } },
    columns: [{ ...base.columns[0], id: FALLBACK.column, widgets }],
  }
  // On the checkout the essentials go BEFORE the section holding Place order,
  // so a step-by-step page asks them before its last step, never after it.
  const placeAt = page === 'checkout'
    ? cleaned.sections.findIndex((s) => s.pin !== 'bottom' && s.columns.some((c) => c.widgets.some((w) => isPageBlockWidget(w) && w.content.block === 'checkout.place_order')))
    : -1
  const sections = placeAt >= 0 ? [...cleaned.sections.slice(0, placeAt), section, ...cleaned.sections.slice(placeAt)] : [...cleaned.sections, section]
  return { ...cleaned, sections }
}
