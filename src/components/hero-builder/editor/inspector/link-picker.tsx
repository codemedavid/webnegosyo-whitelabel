'use client'

import { createContext, useContext, useMemo, useState } from 'react'

import { EMPTY_LINK_CATALOG, type LinkCatalog } from '@/lib/hero-builder/link-catalog'
import { resolveEntryOption } from '@/lib/hero-builder/entry-copy'
import { ENTRY_MODES, linkTargetHref, parseLinkTarget, type LinkTarget } from '@/lib/hero-builder/link-target'
import type { EntryMode } from '@/lib/hero-builder/types'
import { safeAnchor } from '@/lib/hero-builder/safe-values'

import { Field, SelectField, TextInput, Toggle } from '../controls'

/** Most products the picker lists at once; typing narrows a long menu. */
const MAX_PRODUCT_OPTIONS = 150

const LinkCatalogContext = createContext<LinkCatalog>(EMPTY_LINK_CATALOG)
export const LinkCatalogProvider = LinkCatalogContext.Provider

/**
 * Which page the links live on. A hero sits above the menu, so it links into
 * it; a welcome page comes BEFORE the menu (and before a branch is chosen), so
 * its in-store links start an order instead.
 */
export type LinkSurface = 'hero' | 'welcome'
const LinkSurfaceContext = createContext<LinkSurface>('hero')
export const LinkSurfaceProvider = LinkSurfaceContext.Provider
export const useLinkSurface = (): LinkSurface => useContext(LinkSurfaceContext)

type LinkMode = 'none' | 'menu' | 'category' | 'product' | 'start' | 'order-type' | 'section' | 'url'

const MODE_LABELS: Record<LinkMode, string> = {
  none: 'No link',
  menu: 'The menu',
  category: 'A category',
  product: 'A product',
  start: 'Start ordering',
  'order-type': 'Start a dine-in, pickup or delivery order',
  section: 'A section of this page',
  url: 'Web address, phone or email',
}

const SURFACE_MODES: Record<LinkSurface, readonly LinkMode[]> = {
  hero: ['none', 'menu', 'category', 'product', 'section', 'url'],
  welcome: ['none', 'start', 'order-type', 'section', 'url'],
}

function modeOf(target: LinkTarget, fallback: LinkMode): LinkMode {
  switch (target.type) {
    case 'menu':
    case 'category':
    case 'product':
    case 'url':
      return target.type
    case 'welcome-start':
      return 'start'
    case 'welcome-mode':
      return 'order-type'
    case 'anchor':
      return 'section'
    default:
      return fallback
  }
}

interface LinkPickerProps {
  value: string | undefined
  onChange: (href: string) => void
  /** Anchors of the design's sections. */
  sectionAnchors: readonly string[]
  /** Optional links (images, icons) can be cleared; buttons always link. */
  allowNone?: boolean
  newTab?: boolean
  onNewTabChange?: (newTab: boolean) => void
}

export function LinkPicker({ value, onChange, sectionAnchors, allowNone = false, newTab, onNewTabChange }: LinkPickerProps) {
  const catalog = useContext(LinkCatalogContext)
  const surface = useContext(LinkSurfaceContext)
  const target = parseLinkTarget(value)
  const fallback: LinkMode = allowNone ? 'none' : surface === 'welcome' ? 'start' : 'menu'
  // A blank or half-typed web address parses as "no link": typed text stays in
  // web-address mode, and a just-chosen blank one is remembered here.
  const [isUrlPending, setIsUrlPending] = useState(false)
  const isUnparsedText = target.type === 'none' && !!value?.trim()
  const mode = target.type === 'none' && (isUrlPending || isUnparsedText) ? 'url' : modeOf(target, fallback)
  // A target with nothing to pick (no categories, no named sections) is not offered.
  const hasChoices: Record<LinkMode, boolean> = {
    none: allowNone,
    menu: true,
    category: catalog.categories.length > 0,
    product: catalog.products.length > 0,
    start: true,
    'order-type': true,
    section: sectionAnchors.length > 0,
    url: true,
  }
  const offered = SURFACE_MODES[surface].filter((m) => m === mode || hasChoices[m])
  // A link carried over from the other builder (e.g. a hero section preset)
  // still shows what it points at, so the merchant can see and change it.
  const modes = offered.includes(mode) ? offered : [mode, ...offered]

  const chooseMode = (next: LinkMode) => {
    setIsUrlPending(next === 'url')
    if (next === 'none' || next === 'url') return onChange('')
    if (next === 'menu') return onChange(linkTargetHref({ type: 'menu' }))
    if (next === 'start') return onChange(linkTargetHref({ type: 'welcome-start' }))
    if (next === 'order-type') return onChange(linkTargetHref({ type: 'welcome-mode', mode: 'pickup' }))
    if (next === 'category') {
      const first = catalog.categories[0]
      return onChange(first ? linkTargetHref({ type: 'category', categoryId: first.id }) : '')
    }
    if (next === 'product') {
      const first = catalog.products[0]
      return onChange(first ? linkTargetHref({ type: 'product', itemId: first.id }) : '')
    }
    const anchor = sectionAnchors[0]
    return onChange(anchor ? linkTargetHref({ type: 'anchor', anchor }) : '')
  }

  return (
    <div className="space-y-2">
      <Field label="Link to">
        <SelectField<LinkMode> value={mode} onChange={chooseMode} options={modes.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
      </Field>
      {mode === 'menu' && <p className="text-[11px] leading-snug text-neutral-500">Scrolls down to your menu.</p>}
      {mode === 'start' && (
        <p className="text-[11px] leading-snug text-neutral-500">
          Opens your branch list (or your menu, for a single store). Customers choose the order type at checkout.
        </p>
      )}
      {mode === 'order-type' && <OrderTypeChoice target={target} onChange={onChange} />}
      {mode === 'category' && <CategoryChoice target={target} catalog={catalog} onChange={onChange} />}
      {mode === 'product' && <ProductChoice target={target} catalog={catalog} onChange={onChange} />}
      {mode === 'section' && <SectionChoice target={target} anchors={sectionAnchors} onChange={onChange} />}
      {mode === 'url' && (
        <>
          <Field label="Address" hint="https://…, /page, tel:+63…, mailto:you@…">
            <TextInput value={value ?? ''} placeholder="https://" onChange={(e) => onChange(e.target.value)} />
          </Field>
          {onNewTabChange && <Toggle label="Open in new tab" checked={!!newTab} onChange={onNewTabChange} />}
        </>
      )}
    </div>
  )
}

interface ChoiceProps {
  target: LinkTarget
  catalog: LinkCatalog
  onChange: (href: string) => void
}

function MissingNote({ children }: { children: string }) {
  return <p className="text-[11px] leading-snug text-amber-700">{children}</p>
}

function CategoryChoice({ target, catalog, onChange }: ChoiceProps) {
  if (!catalog.categories.length) return <MissingNote>Your menu has no categories yet.</MissingNote>
  const selected = target.type === 'category' ? target.categoryId : undefined
  const isMissing = !!selected && !catalog.categories.some((c) => c.id === selected)
  return (
    <>
      <SelectField
        value={isMissing ? '' : selected}
        placeholder={isMissing ? 'Choose a category' : undefined}
        onChange={(categoryId) => categoryId && onChange(linkTargetHref({ type: 'category', categoryId }))}
        options={catalog.categories.map((c) => ({ value: c.id, label: c.name }))}
      />
      {isMissing && <MissingNote>The linked category is no longer on your menu — pick another.</MissingNote>}
    </>
  )
}

function ProductChoice({ target, catalog, onChange }: ChoiceProps) {
  const [query, setQuery] = useState('')
  const selected = target.type === 'product' ? target.itemId : undefined
  const selectedProduct = catalog.products.find((p) => p.id === selected)
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? catalog.products.filter((p) => p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q))
      : catalog.products
    const shown = matches.slice(0, MAX_PRODUCT_OPTIONS)
    // Keep the current choice listed even when the search hides it.
    return selectedProduct && !shown.includes(selectedProduct) ? [selectedProduct, ...shown] : shown
  }, [catalog.products, query, selectedProduct])

  if (!catalog.products.length) return <MissingNote>Your menu has no products yet.</MissingNote>
  return (
    <>
      <TextInput value={query} placeholder="Search products…" onChange={(e) => setQuery(e.target.value)} />
      <SelectField
        value={selectedProduct?.id ?? ''}
        placeholder={selectedProduct ? undefined : 'Choose a product'}
        onChange={(itemId) => itemId && onChange(linkTargetHref({ type: 'product', itemId }))}
        options={options.map((p) => ({ value: p.id, label: p.categoryName ? `${p.name} — ${p.categoryName}` : p.name }))}
      />
      {selected && !selectedProduct && <MissingNote>The linked product is no longer on your menu — pick another.</MissingNote>}
      <p className="text-[11px] leading-snug text-neutral-500">Opens the product so customers can add it to their order.</p>
    </>
  )
}

const NO_COPY = { labels: {}, blurbs: {}, icons: {} }

function OrderTypeChoice({ target, onChange }: { target: LinkTarget; onChange: (href: string) => void }) {
  const selected: EntryMode = target.type === 'welcome-mode' ? target.mode : 'pickup'
  return (
    <>
      <SelectField<EntryMode>
        value={selected}
        onChange={(mode) => onChange(linkTargetHref({ type: 'welcome-mode', mode }))}
        options={ENTRY_MODES.map((mode) => ({ value: mode, label: resolveEntryOption(NO_COPY, mode).label }))}
      />
      <p className="text-[11px] leading-snug text-neutral-500">
        If no branch offers it right now, the customer just starts a normal order.
      </p>
    </>
  )
}

function SectionChoice({ target, anchors, onChange }: { target: LinkTarget; anchors: readonly string[]; onChange: (href: string) => void }) {
  if (!anchors.length) {
    return <MissingNote>Select a section and give it an Anchor link name first.</MissingNote>
  }
  const selected = target.type === 'anchor' ? target.anchor : undefined
  return (
    <SelectField
      value={selected && anchors.includes(selected) ? selected : ''}
      placeholder={selected && anchors.includes(selected) ? undefined : 'Choose a section'}
      onChange={(anchor) => anchor && onChange(linkTargetHref({ type: 'anchor', anchor }))}
      options={anchors.map((anchor) => ({ value: anchor, label: `#${anchor}` }))}
    />
  )
}

/** Anchors a hero link can scroll to, in section order. */
export function sectionAnchorsOf(sections: readonly { anchor?: string }[]): string[] {
  return sections.map((s) => safeAnchor(s.anchor)).filter((a): a is string => !!a && parseLinkTarget(`#${a}`).type === 'anchor')
}
