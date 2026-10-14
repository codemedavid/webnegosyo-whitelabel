/**
 * Storefront visit counting — the pure rules shared by the browser beacon and
 * POST /api/storefront/visit. A "visit" is one browser session opening a
 * store: the owner checking their own store, previews drawn in a frame
 * (Branding Studio, the set-up page's live phone) and crawlers do not count,
 * because on day one those would be the only "visitors" a store has.
 */

export interface VisitRequest {
  slug: string
}

export interface VisitContext {
  /** The signed-in viewer administers this store. */
  isOwnerViewing: boolean
  /** The storefront is drawn inside another page (a preview). */
  isFramed: boolean
  hasCountedThisSession: boolean
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|externalhit|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http/i

export const VISIT_ENDPOINT = '/api/storefront/visit'

export function parseVisitRequest(body: unknown): VisitRequest | null {
  if (!body || typeof body !== 'object') return null
  const slug = (body as { slug?: unknown }).slug
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null
  return { slug }
}

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return BOT_PATTERN.test(userAgent)
}

export function shouldCountVisit(context: VisitContext): boolean {
  return !context.isOwnerViewing && !context.isFramed && !context.hasCountedThisSession
}

export function visitStorageKey(slug: string): string {
  return `wn-visit-counted:${slug}`
}
