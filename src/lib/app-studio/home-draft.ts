/**
 * The App Studio draft: what the app's Home, copy, font and corners will be
 * once published (`tenant_app_configs.draft` → `published`). Pure.
 *
 * Publishing only ever copies a draft that passes BOTH checks the live
 * `/api/app/v1/config` route depends on: the published shape, and the full
 * config the app validates. `readPublished` falls back to the store's default
 * Home when published is invalid, so an unchecked publish would silently
 * replace the store's Home with the default one.
 */
import { appConfigSchema, type AppConfig, type AppHomeBlock, type AppHomeBlockType } from '@/lib/app-contract'
import { appPublishedConfigSchema, projectAppConfig, type AppConfigInput, type AppPublishedConfig } from '@/lib/app-api/project-config'

export type AppStudioDraft = AppPublishedConfig

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What the editor opens on: the saved draft, else what is published, else what the app shows today. */
export function startingDraft(draft: unknown, published: unknown, effective: AppConfig): AppStudioDraft {
  for (const candidate of [draft, published]) {
    if (isObject(candidate) && Object.keys(candidate).length > 0) {
      const parsed = appPublishedConfigSchema.safeParse(candidate)
      if (parsed.success) return parsed.data
    }
  }
  return {
    copy: effective.copy,
    theme: { fontKey: effective.theme.fontKey, corners: effective.theme.corners },
    home: effective.home,
  }
}

export type PublishCheck = { ok: true; draft: AppStudioDraft; config: AppConfig } | { ok: false; error: string }

/** Whether this draft may become the published config, with the config the app would receive. */
export function checkDraftForPublish(draft: unknown, input: Omit<AppConfigInput, 'published'>): PublishCheck {
  const parsed = appPublishedConfigSchema.safeParse(draft)
  if (!parsed.success) return { ok: false, error: describe(parsed.error.issues[0]) }
  const config = appConfigSchema.safeParse(projectAppConfig({ ...input, published: parsed.data }))
  if (!config.success) return { ok: false, error: describe(config.error.issues[0]) }
  return { ok: true, draft: parsed.data, config: config.data }
}

function describe(issue: { message: string; path: PropertyKey[] } | undefined): string {
  if (!issue) return 'This draft can’t be published'
  const where = issue.path.filter((part) => typeof part === 'string' || typeof part === 'number').join(' › ')
  return where ? `${issue.message} (${where})` : issue.message
}

/** Same content, whatever the key order. */
export function sameDraft(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export const BLOCK_LABELS: Readonly<Record<AppHomeBlockType, string>> = {
  memberCard: 'Member card',
  bannerCarousel: 'Banners',
  quickActions: 'Quick actions',
  featuredItems: 'Featured dishes',
  categoriesRail: 'Menu categories',
  rewardsTeaser: 'Rewards teaser',
  announcement: 'Announcement',
  orderAgain: 'Order again',
}

/** A fresh block of `type` with a unique id among `existing`. */
export function newBlock(type: AppHomeBlockType, existing: readonly AppHomeBlock[]): AppHomeBlock {
  const taken = new Set(existing.map((block) => block.id))
  let index = 1
  while (taken.has(`${type}-${index}`)) index += 1
  const id = `${type}-${index}`
  switch (type) {
    case 'memberCard':
      return { id, type, visibleWhen: 'always' }
    case 'bannerCarousel':
      return { id, type, visibleWhen: 'always', format: 'landscape', autoplay: true, banners: [] }
    case 'quickActions':
      return { id, type, visibleWhen: 'always', actions: ['menu'] }
    case 'featuredItems':
      return { id, type, visibleWhen: 'always', title: 'Our favourites', source: 'featured', itemIds: [] }
    case 'categoriesRail':
      return { id, type, visibleWhen: 'always', title: 'Browse the menu' }
    case 'rewardsTeaser':
      return { id, type, visibleWhen: 'guest', title: 'Every order counts', body: 'Sign in with your number to collect a stamp on every order.' }
    case 'announcement':
      return { id, type, visibleWhen: 'always', text: 'Write your announcement', tone: 'info' }
    case 'orderAgain':
      return { id, type, visibleWhen: 'member', title: 'Order again' }
  }
}

/** Moves the block at `from` by `step` (−1 up, +1 down); out of range = unchanged. */
export function moveBlock(blocks: readonly AppHomeBlock[], from: number, step: -1 | 1): AppHomeBlock[] {
  const to = from + step
  if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length) return [...blocks]
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * What the app would show with this draft published, from the store's config
 * WITHOUT any published draft (`projectAppConfig` with `published: null`).
 * The same merge `projectAppConfig` makes, so the preview needs no store row.
 */
export function previewConfig(base: AppConfig, draft: AppStudioDraft): AppConfig {
  return {
    ...base,
    theme: { ...base.theme, fontKey: draft.theme?.fontKey ?? base.theme.fontKey, corners: draft.theme?.corners ?? base.theme.corners },
    copy: { ...base.copy, ...draft.copy },
    home: { blocks: draft.home?.blocks ?? base.home.blocks },
  }
}
