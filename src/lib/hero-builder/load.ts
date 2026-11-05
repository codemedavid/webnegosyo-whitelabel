// ---------------------------------------------------------------------------
// Reading a stored hero design. `tenants.hero_design` is a TEXT column, so the
// API hands back a JSON string — not an object. Every reader goes through
// `loadHeroDesign`, which parses, converts v4, and drops structurally broken
// nodes so one bad node can never blank the whole hero.
// ---------------------------------------------------------------------------

import { DEFAULT_THEME } from './defaults'
import { LIMITS } from './constants'
import { isV4Design, migrateV4Design } from './migrate-v4'
import type { Column, HeroDesignV5, NodeStyle, PageLayout, PageSettings, Section, Theme, Widget, WidgetKind } from './types'

const WIDGET_KINDS: readonly WidgetKind[] = [
  'heading', 'text', 'buttons', 'image', 'video', 'icon', 'icon-list',
  'badge', 'countdown', 'divider', 'spacer', 'gallery', 'html', 'embed',
  'order-entry', 'store-logo', 'slideshow', 'page-block',
]

type Loose = Record<string, unknown>

const isObject = (value: unknown): value is Loose => !!value && typeof value === 'object' && !Array.isArray(value)
const asId = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null

/** Parse the column value (JSON string or already-parsed object). */
export function parseStoredDesign(raw: unknown): Loose | null {
  if (isObject(raw)) return raw
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > LIMITS.designBytes * 2) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function storedDesignVersion(raw: unknown): number | null {
  const parsed = parseStoredDesign(raw)
  return parsed && typeof parsed.version === 'number' ? parsed.version : null
}

function style(value: unknown): NodeStyle {
  return isObject(value) ? (value as NodeStyle) : {}
}

function layers(node: Loose): Pick<Section, 'style' | 'tablet' | 'mobile'> {
  return {
    style: style(node.style),
    ...(isObject(node.tablet) ? { tablet: node.tablet as NodeStyle } : {}),
    ...(isObject(node.mobile) ? { mobile: node.mobile as NodeStyle } : {}),
  }
}

/** Known-shape page states only; anything else reads as "always shown". */
function showWhen(value: unknown): { showWhen?: string[] } {
  if (!Array.isArray(value)) return {}
  const states = value.filter((v): v is string => typeof v === 'string' && /^[a-z_]{1,32}$/.test(v)).slice(0, 12)
  return states.length ? { showWhen: states } : {}
}

function widget(value: unknown): Widget | null {
  if (!isObject(value)) return null
  const id = asId(value.id)
  const content = value.content
  if (!id || !isObject(content)) return null
  const kind = content.kind as WidgetKind
  if (!WIDGET_KINDS.includes(kind) || value.kind !== kind) return null
  return {
    id,
    kind,
    content: content as unknown as Widget['content'],
    ...layers(value),
    ...(isObject(value.animation) ? { animation: value.animation as unknown as Widget['animation'] } : {}),
    ...showWhen(value.showWhen),
  }
}

function column(value: unknown): Column | null {
  if (!isObject(value)) return null
  const id = asId(value.id)
  if (!id) return null
  const widgets = Array.isArray(value.widgets) ? value.widgets.map(widget).filter((w): w is Widget => !!w) : []
  return { id, widgets, ...layers(value) }
}

function section(value: unknown): Section | null {
  if (!isObject(value)) return null
  const id = asId(value.id)
  if (!id || !Array.isArray(value.columns)) return null
  const columns = value.columns
    .slice(0, LIMITS.columnsPerSection)
    .map(column)
    .filter((c): c is Column => !!c)
  if (!columns.length) return null
  return {
    id,
    label: typeof value.label === 'string' ? value.label.slice(0, 80) : 'Section',
    ...(typeof value.anchor === 'string' ? { anchor: value.anchor } : {}),
    columns,
    ...layers(value),
    ...showWhen(value.showWhen),
    ...(value.pin === 'bottom' ? { pin: 'bottom' as const } : {}),
  }
}

const PAGE_LAYOUTS: readonly PageLayout[] = ['scroll', 'steps', 'accordion']
const PAGE_PROGRESS = ['bar', 'numbers', 'dots', 'none'] as const

/** Page Designer whole-page settings, shape-checked (values are re-validated where they are used). */
function pageSettings(value: unknown): { page?: PageSettings } {
  if (!isObject(value)) return {}
  const page: PageSettings = {}
  if (isObject(value.parts)) {
    const parts = Object.entries(value.parts)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .slice(0, LIMITS.pageParts)
    if (parts.length) page.parts = Object.fromEntries(parts)
  }
  if (PAGE_LAYOUTS.includes(value.layout as PageLayout)) page.layout = value.layout as PageLayout
  if ((PAGE_PROGRESS as readonly unknown[]).includes(value.progress)) page.progress = value.progress as PageSettings['progress']
  if (typeof value.nextLabel === 'string') page.nextLabel = value.nextLabel.slice(0, 40)
  return Object.keys(page).length ? { page } : {}
}

function theme(value: unknown): Theme {
  if (!isObject(value)) return { ...DEFAULT_THEME, colors: {} }
  return {
    colors: isObject(value.colors) ? (value.colors as Theme['colors']) : {},
    headingFont: typeof value.headingFont === 'string' ? value.headingFont : '',
    bodyFont: typeof value.bodyFont === 'string' ? value.bodyFont : '',
    buttonRadius: typeof value.buttonRadius === 'number' ? value.buttonRadius : DEFAULT_THEME.buttonRadius,
  }
}

/**
 * The stored design as v5, or null when there is nothing renderable. v3
 * (absolute-positioned) designs are not handled here — they keep their own
 * legacy renderer.
 */
export function loadHeroDesign(raw: unknown): HeroDesignV5 | null {
  const parsed = parseStoredDesign(raw)
  if (!parsed) return null
  if (isV4Design(parsed)) {
    // Legacy rows are untrusted shape-wise; a converter bug must blank the
    // hero, never crash the storefront page that also hosts the cart.
    try {
      return migrateV4Design(parsed)
    } catch {
      return null
    }
  }
  if (parsed.version !== 5 || !Array.isArray(parsed.sections)) return null
  const sections = parsed.sections
    .slice(0, LIMITS.sections)
    .map(section)
    .filter((s): s is Section => !!s)
  return { version: 5, theme: theme(parsed.theme), sections, ...pageSettings(parsed.page) }
}
