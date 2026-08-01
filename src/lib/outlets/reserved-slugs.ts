/**
 * Outlet slug validation.
 *
 * A slug becomes a URL: `?outlet={slug}` today and `/b/{slug}` alongside it. A
 * slug that matches a real route segment would shadow part of the storefront,
 * so collisions are rejected at creation time rather than being resolved at
 * request time — the route table is the source of truth and it is enumerated
 * here explicitly.
 *
 * Pure and dependency-free: the admin form, the server action, and the
 * repository all validate through this one function, so there is no path that
 * writes a slug the router cannot safely serve.
 */

/**
 * Every path segment the app can serve directly under a tenant, plus the
 * platform-root segments a tenant subdomain rewrites into (see
 * `src/middleware.ts`) and the reserved subdomains from `src/lib/tenant.ts`.
 *
 * Keep this in sync with `src/app/[tenant]/*` and `src/app/*`. The slug test
 * suite asserts each entry, so removing one is a visible, deliberate act.
 */
export const RESERVED_OUTLET_SLUGS: ReadonlySet<string> = new Set([
  // src/app/[tenant]/*
  'menu',
  'cart',
  'checkout',
  'order',
  'orders',
  'admin',
  'login',
  'logout',
  'about',
  'privacy',
  'terms',
  'refund',
  // Platform-root segments reachable through a tenant subdomain rewrite.
  'api',
  'download',
  'support',
  'superadmin',
  'www',
  'app',
  'static',
  'assets',
  'images',
  'public',
  'favicon',
  'sitemap',
  'robots',
  'monitoring',
  // The deep-link prefix itself.
  'b',
  // Words we may want back later; cheaper to reserve now than to migrate a
  // merchant's live QR codes off them.
  'outlet',
  'outlets',
  'branch',
  'branches',
  'settings',
  'account',
  'help',
  'search',
  'new',
  'edit',
])

/** Slugs are URL segments: lowercase alphanumerics joined by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const MIN_SLUG_LENGTH = 2
const MAX_SLUG_LENGTH = 40

const FORMAT_MESSAGE =
  'Use letters, numbers and single hyphens only (for example "bgc-high-street").'

/** A validated slug, or the reason a merchant cannot use what they typed. */
export type OutletSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; error: string }

/**
 * Validate and normalize a slug typed by a merchant.
 *
 * Normalization is deliberately limited to trimming and lowercasing — anything
 * more (silently stripping characters) would store something other than what
 * the merchant typed and printed on their signage.
 */
export function validateOutletSlug(raw: unknown): OutletSlugValidation {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'A branch link (slug) is required.' }
  }

  const slug = raw.trim().toLowerCase()

  // Reserved before shape: a merchant who types "b" needs to be told the word
  // is taken, not that it is one character short — otherwise they lengthen it
  // and hit a second, unrelated-looking rejection.
  if (RESERVED_OUTLET_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" is reserved by the site and cannot be used.` }
  }

  if (slug.length < MIN_SLUG_LENGTH) {
    return { ok: false, error: `Branch links must be at least ${MIN_SLUG_LENGTH} characters.` }
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    return { ok: false, error: `Branch links must be ${MAX_SLUG_LENGTH} characters or fewer.` }
  }

  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: FORMAT_MESSAGE }
  }

  return { ok: true, slug }
}

/**
 * Suggest a slug from an outlet's display name.
 *
 * Only a suggestion — the merchant can always overwrite it, and the result
 * still goes through `validateOutletSlug` before it is stored. Returns an empty
 * string when the name has nothing slug-able in it (e.g. only punctuation), so
 * the caller can leave the field blank rather than inventing a slug.
 */
export function slugifyOutletName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    // Drop combining marks so "café" becomes "cafe" rather than "caf".
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length <= MAX_SLUG_LENGTH) return slug

  // Truncating can leave a dangling hyphen, which the pattern rejects.
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')
}
