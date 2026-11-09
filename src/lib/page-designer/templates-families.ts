// ---------------------------------------------------------------------------
// "Use this style on all three pages": after an owner picks a family look
// (templates-looks.ts) on one page, the editor of each OTHER page offers the
// matching template once. Pure: the editor stores the pick (localStorage,
// per store) and asks here what to offer.
// ---------------------------------------------------------------------------

import { PAGE_IDS } from './pages'
import { PAGE_TEMPLATES, type PageTemplate } from './templates'
import { FAMILY_NAMES, TEMPLATE_FAMILIES, type TemplateFamily } from './templates-looks'
import type { PageId } from './types'

/** localStorage key per store. */
export const familyStorageKey = (tenantId: string) => `pd-family:${tenantId}`

/** A pick older than this is not offered any more. */
export const FAMILY_OFFER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export interface FamilyPick {
  family: TemplateFamily
  /** The page the owner picked the look on. */
  from: PageId
  /** Epoch ms. */
  at: number
  /** Pages that already took the look or said no to it. */
  done: PageId[]
}

export interface FamilyOffer {
  template: PageTemplate
  family: TemplateFamily
  familyName: string
  from: PageId
}

/** The page's name in a sentence ("for checkout", "the matching thank-you look"). */
export const PAGE_WORDS: Readonly<Record<PageId, string>> = {
  checkout: 'checkout',
  confirmation: 'thank-you',
  tracking: 'order tracking',
}

const isPage = (value: unknown): value is PageId => (PAGE_IDS as readonly unknown[]).includes(value)
const isFamily = (value: unknown): value is TemplateFamily => (TEMPLATE_FAMILIES as readonly unknown[]).includes(value)

/** A stored pick, shape-checked (anything else = no pick). */
export function parseFamilyPick(value: unknown): FamilyPick | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (!isFamily(raw.family) || !isPage(raw.from) || typeof raw.at !== 'number' || !Number.isFinite(raw.at)) return null
  const done = Array.isArray(raw.done) ? [...new Set(raw.done.filter(isPage))] : []
  return { family: raw.family, from: raw.from, at: raw.at, done }
}

/** The family of template `templateId` on `page`, if it has one. */
export function familyOf(page: PageId, templateId: string): TemplateFamily | null {
  return PAGE_TEMPLATES[page].find((t) => t.id === templateId)?.family ?? null
}

/** The page's template in `family`, if it has one. */
export function familyTemplate(page: PageId, family: TemplateFamily): PageTemplate | null {
  return PAGE_TEMPLATES[page].find((t) => t.family === family) ?? null
}

const isFresh = (pick: FamilyPick, now: number) => now - pick.at >= 0 && now - pick.at <= FAMILY_OFFER_MAX_AGE_MS

/** `pick` with `page` marked as taken / declined. */
export function withPageDone(pick: FamilyPick, page: PageId): FamilyPick {
  return pick.done.includes(page) ? pick : { ...pick, done: [...pick.done, page] }
}

/**
 * The pick to store after the owner picked `templateId` on `page`:
 * - a family look starts a new pick (or joins the current one of the same family);
 * - any other template on the page the pick came from ends it (null);
 * - any other template elsewhere means "not that look here" (page marked done).
 */
export function nextFamilyPick(prev: FamilyPick | null, page: PageId, templateId: string, now: number): FamilyPick | null {
  const current = prev && isFresh(prev, now) ? prev : null
  const family = familyOf(page, templateId)
  if (family) {
    if (current && current.family === family) return withPageDone(current, page)
    return { family, from: page, at: now, done: [page] }
  }
  if (!current) return null
  if (current.from === page) return null
  return withPageDone(current, page)
}

/** What to offer on `page`, or null (no pick, stale, same page, already answered, no matching template). */
export function familyOffer(pick: FamilyPick | null, page: PageId, now: number): FamilyOffer | null {
  if (!pick || !isFresh(pick, now) || pick.from === page || pick.done.includes(page)) return null
  const template = familyTemplate(page, pick.family)
  if (!template) return null
  return { template, family: pick.family, familyName: FAMILY_NAMES[pick.family], from: pick.from }
}

/** The banner's sentence. */
export function familyOfferMessage(offer: FamilyOffer, page: PageId): string {
  return `You picked the ${offer.familyName} look for ${PAGE_WORDS[offer.from]} — use the matching ${PAGE_WORDS[page]} look?`
}
