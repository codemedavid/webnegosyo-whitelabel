/**
 * Dishes read from menu photos → the import the owner confirms. Pure.
 *
 * The parser's categories are matched to the store's own by name (accents and
 * case ignored), so "rice meals" lands in the existing "Rice Meals" instead of
 * a twin. A dish already on the menu, or twice in the photos, is left out:
 * importing the same photo twice adds nothing twice.
 */

import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import type { MenuImportCategory, MenuImportPayload } from '@/lib/assistant/actions/kinds'
import type { ParsedMenuData, ParsedMenuItem } from '@/types/ai-menu-parser'

/** Dishes one import can carry: a card the owner can still read, a write that stays quick. */
export const MAX_IMPORT_ITEMS = 40
/** Dish lines a confirm card shows before "and N more". */
export const MAX_CARD_ITEMS = 20
const MAX_DESCRIPTION_CHARS = 300
const MAX_NAME_CHARS = 80
const MAX_PRICE = 100_000
const FALLBACK_CATEGORY = 'Other'

export function foldName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase().trim()
}

export interface StoreMenuNames {
  categories: ReadonlyArray<{ name: string }>
  itemNames: readonly string[]
}

export interface ImportDraft {
  payload: MenuImportPayload
  /** Dishes left out because the menu already has them. */
  alreadyOnMenu: string[]
  /** Dishes left out because the import was full. */
  overLimit: number
}

function cleanText(value: string | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Menus are often printed in capitals; "CHICKEN ADOBO" reads as shouting on a storefront. */
export function tidyName(value: string | undefined): string {
  const name = cleanText(value, MAX_NAME_CHARS)
  if (!/[A-Z]{2}/.test(name) || name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(/(^|[\s(/&-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}

/** Every category the items use, in first-use order, each resolved once. */
function categoriesFor(items: readonly ParsedMenuItem[], resolve: (name: string) => MenuImportCategory): MenuImportCategory[] {
  const byName = new Map<string, MenuImportCategory>()
  for (const item of items) {
    const category = resolve(item.category)
    if (!byName.has(category.name)) byName.set(category.name, category)
  }
  return [...byName.values()]
}

/** Resolves a category name to the store's own category, or a new one. */
function categoryResolver(store: StoreMenuNames, icons: ReadonlyMap<string, string>) {
  const existing = new Map(store.categories.map((category) => [foldName(category.name), category.name]))
  return (raw: string): MenuImportCategory => {
    const name = tidyName(raw)
    const usable = name.length >= 2 ? name : FALLBACK_CATEGORY
    const match = existing.get(foldName(usable))
    if (match) return { name: match, icon: null, isNew: false }
    return { name: usable, icon: icons.get(foldName(usable)) ?? null, isNew: true }
  }
}

function cleanItem(item: ParsedMenuItem, categoryName: string): ParsedMenuItem {
  const description = cleanText(item.description, MAX_DESCRIPTION_CHARS)
  const note = cleanText(item.note, MAX_DESCRIPTION_CHARS)
  return {
    name: tidyName(item.name),
    category: categoryName,
    price: Math.min(Math.max(0, Math.round(item.price * 100) / 100), MAX_PRICE),
    ...(description ? { description } : {}),
    ...(note ? { note } : {}),
    ...(item.variations?.length ? { variations: item.variations } : {}),
    ...(item.addons?.length ? { addons: item.addons } : {}),
  }
}

export function buildImportDraft(parsed: ParsedMenuData, store: StoreMenuNames, maxItems = MAX_IMPORT_ITEMS): ImportDraft {
  const icons = new Map(parsed.categories.flatMap((c) => (c.icon ? [[foldName(c.name), c.icon] as const] : [])))
  const resolve = categoryResolver(store, icons)
  const onMenu = new Set(store.itemNames.map(foldName))
  const seen = new Set<string>()
  const alreadyOnMenu: string[] = []
  const kept: ParsedMenuItem[] = []
  let overLimit = 0

  for (const raw of parsed.items) {
    const name = tidyName(raw.name)
    const key = foldName(name)
    if (name.length < 2 || seen.has(key)) continue
    seen.add(key)
    if (onMenu.has(key)) {
      alreadyOnMenu.push(name)
      continue
    }
    if (kept.length >= maxItems) {
      overLimit += 1
      continue
    }
    kept.push(cleanItem({ ...raw, name }, resolve(raw.category).name))
  }

  return { payload: { categories: categoriesFor(kept, resolve), items: kept }, alreadyOnMenu, overLimit }
}

export interface ImportItemChange {
  index: number
  name: string | null
  price: number | null
  category: string | null
}

export interface ImportEdits {
  remove: readonly number[]
  changes: readonly ImportItemChange[]
}

/** The import with the owner's edits applied, or why they cannot be. */
export function applyImportEdits(payload: MenuImportPayload, edits: ImportEdits, store: StoreMenuNames): MenuImportPayload | string {
  const icons = new Map(payload.categories.flatMap((c) => (c.icon ? [[foldName(c.name), c.icon] as const] : [])))
  const resolve = categoryResolver(store, icons)
  const outOfRange = [...edits.remove, ...edits.changes.map((c) => c.index)].find((index) => index < 0 || index >= payload.items.length)
  if (outOfRange !== undefined) return 'One of those dishes is not in this import.'

  const removed = new Set(edits.remove)
  const changesByIndex = new Map(edits.changes.map((change) => [change.index, change]))
  const items = payload.items.flatMap((item, index) => {
    if (removed.has(index)) return []
    const change = changesByIndex.get(index)
    if (!change) return [item]
    return [cleanItem({
      ...item,
      name: change.name ?? item.name,
      price: change.price ?? item.price,
      category: change.category ?? item.category,
    }, resolve(change.category ?? item.category).name)]
  })
  if (items.length === 0) return 'That would leave nothing to add.'

  const onMenu = new Set(store.itemNames.map(foldName))
  const names = items.map((item) => foldName(item.name))
  const clash = items.find((item, index) => item.name.length < 2 || onMenu.has(names[index]) || names.indexOf(names[index]) !== index)
  if (clash) return `"${clash.name}" is already on the menu or in this import, or is too short a name.`
  return { categories: categoriesFor(items, resolve), items }
}

function itemDetail(item: ParsedMenuItem): string {
  const extras = [
    item.variations?.length ? `${item.variations.reduce((sum, group) => sum + group.options.length, 0)} choices` : null,
    item.addons?.length ? `${item.addons.length} add-ons` : null,
  ].filter(Boolean)
  const price = item.price > 0 ? formatPeso(item.price) : 'No price yet'
  return [price, item.category, ...extras].join(' · ')
}

export function importCardLines(payload: MenuImportPayload): Array<{ label: string; value: string }> {
  const lines = payload.items.slice(0, MAX_CARD_ITEMS).map((item) => ({ label: item.name, value: itemDetail(item) }))
  const hidden = payload.items.length - MAX_CARD_ITEMS
  if (hidden > 0) lines.push({ label: `+${hidden} more`, value: 'Also added when you confirm' })
  const fresh = payload.categories.filter((c) => c.isNew).map((c) => c.name)
  if (fresh.length > 0) lines.push({ label: 'New categories', value: fresh.join(', ') })
  return lines
}

export function importWarning(payload: MenuImportPayload): string {
  const unpriced = payload.items.filter((item) => item.price <= 0).length
  const base = 'Goes on your menu when you confirm. Add photos to the dishes after.'
  return unpriced > 0 ? `${unpriced} dish${unpriced === 1 ? ' has' : 'es have'} no price yet and would show as ₱0. ${base}` : base
}

/** What the model reads: one short line per dish, addressed by `refFor(index)`. */
export function importFacts(draft: Pick<ImportDraft, 'payload'> & Partial<Omit<ImportDraft, 'payload'>>, refFor: (index: number) => string): Record<string, unknown> {
  const { payload } = draft
  return {
    dishes: payload.items.map((item, index) => `${refFor(index)} ${item.name} ${item.price > 0 ? formatPeso(item.price) : '(no price)'} [${item.category}]`),
    newCategories: payload.categories.filter((c) => c.isNew).map((c) => c.name),
    ...(draft.alreadyOnMenu?.length ? { alreadyOnMenuSkipped: draft.alreadyOnMenu.slice(0, 10) } : {}),
    ...(draft.overLimit ? { leftOutOverLimit: draft.overLimit, limitNote: `One import holds ${MAX_IMPORT_ITEMS} dishes; confirm this, then send the rest again.` } : {}),
    ...(payload.items.some((item) => item.price <= 0) ? { priceMissing: 'Ask the owner for the prices marked (no price) before they confirm.' } : {}),
  }
}
