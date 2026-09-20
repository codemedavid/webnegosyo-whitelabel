/**
 * Pure helpers over the two tenant banner arrays (`promotion_banners` on the
 * menu, `welcome_page_banners` on the welcome page).
 *
 * Both columns are whole-array JSON: a writer that does not read first
 * clobbers every banner the merchant already had. These helpers make the
 * read-modify-write explicit and keep the array logic testable without a DB.
 */

export type BannerSurface = 'menu' | 'welcome'
export type BannerFormat = 'landscape' | 'portrait' | 'square'

export interface StoredBanner {
  id: string
  imageUrl: string
  title?: string
  description?: string
  /** Welcome-page banners only; ignored on the menu surface. */
  format?: BannerFormat
}

export const BANNER_COLUMN: Record<BannerSurface, 'promotion_banners' | 'welcome_page_banners'> = {
  menu: 'promotion_banners',
  welcome: 'welcome_page_banners',
}

const FORMATS: ReadonlySet<string> = new Set(['landscape', 'portrait', 'square'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Coerce whatever the column holds into a clean banner list. Entries without
 * an id or image are dropped (the storefront drops them too); unknown formats
 * fall back to landscape rather than discarding merchant work.
 */
export function normalizeBannerList(raw: unknown): StoredBanner[] {
  if (!Array.isArray(raw)) return []
  const out: StoredBanner[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl : ''
    if (!id || !imageUrl) continue
    const banner: StoredBanner = { id, imageUrl }
    if (typeof entry.title === 'string' && entry.title) banner.title = entry.title
    if (typeof entry.description === 'string' && entry.description) banner.description = entry.description
    if (typeof entry.format === 'string') {
      banner.format = FORMATS.has(entry.format) ? (entry.format as BannerFormat) : 'landscape'
    }
    out.push(banner)
  }
  return out
}

/** Same id shape the Branding Studio generates, so both sources look alike. */
export function newBannerId(now: () => number = Date.now, random: () => number = Math.random): string {
  return `banner-${now()}-${random().toString(36).slice(2, 8)}`
}

export interface NewBannerInput {
  imageUrl: string
  title?: string
  description?: string
  format?: BannerFormat
}

/** Returns a new list with the banner appended; welcome banners always carry a format. */
export function appendBanner(
  list: readonly StoredBanner[],
  surface: BannerSurface,
  input: NewBannerInput,
  id: string,
): StoredBanner[] {
  const banner: StoredBanner = { id, imageUrl: input.imageUrl }
  if (input.title) banner.title = input.title
  if (input.description) banner.description = input.description
  if (surface === 'welcome') banner.format = input.format ?? 'landscape'
  return [...list, banner]
}

export interface BannerPatch {
  imageUrl?: string
  title?: string | null
  description?: string | null
  format?: BannerFormat
}

/**
 * Returns a new list with one banner patched. `null` clears a text field;
 * `undefined` leaves it alone. Throws when the id is unknown so a typo never
 * reads as a successful edit.
 */
export function patchBanner(list: readonly StoredBanner[], bannerId: string, patch: BannerPatch): StoredBanner[] {
  const index = list.findIndex((banner) => banner.id === bannerId)
  if (index === -1) throw new Error(`No banner with id "${bannerId}" on this surface. Use list_banners to see the current ids.`)

  const current = list[index]
  const next: StoredBanner = { ...current }
  if (patch.imageUrl !== undefined) next.imageUrl = patch.imageUrl
  if (patch.title === null) delete next.title
  else if (patch.title !== undefined) next.title = patch.title
  if (patch.description === null) delete next.description
  else if (patch.description !== undefined) next.description = patch.description
  if (patch.format !== undefined && current.format !== undefined) next.format = patch.format

  return [...list.slice(0, index), next, ...list.slice(index + 1)]
}

/** Returns a new list without the banner; throws when the id is unknown. */
export function withoutBanner(list: readonly StoredBanner[], bannerId: string): StoredBanner[] {
  if (!list.some((banner) => banner.id === bannerId)) {
    throw new Error(`No banner with id "${bannerId}" on this surface. Use list_banners to see the current ids.`)
  }
  return list.filter((banner) => banner.id !== bannerId)
}
