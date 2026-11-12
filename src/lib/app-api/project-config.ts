import { z } from 'zod'
import {
  APP_CORNER_STYLES,
  APP_FONT_KEYS,
  appConfigSchema,
  appCopySchema,
  type AppBanner,
  type AppConfig,
  type AppFeatures,
  type AppHomeBlock,
  type AppQuickAction,
} from '@/lib/app-contract'
import { normalizeBannerList } from '@/lib/banner-list'
import { isLoyaltyLive } from '@/lib/loyalty/tenant-flags'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { resolveAvailableModes, type ModeCapableOutlet } from '@/lib/outlets/outlet-modes'
import { getStoreOpenStatus } from '@/lib/store-open-status'
import { modesFromOrderTypes } from '@/lib/welcome-builder/modes'
import { projectAppTheme } from './project-theme'

/**
 * `/api/app/v1/config`: what the customer app needs before its first frame —
 * the store, its theme, its switches, its copy and its home layout.
 *
 * Home layout and copy come from App Studio's PUBLISHED config when it is
 * valid; until a store has one (or if it fails the contract) the app gets a
 * home built from what the store already has — its banners, its order modes,
 * its loyalty programme — so a store never opens on an empty screen.
 */

interface ProjectableTenant extends Record<string, unknown> {
  id: string
  slug: string
  name: string
  is_prelaunch?: boolean | null
  enforce_operating_hours?: boolean | null
  operating_hours?: unknown
  timezone?: string | null
  loyalty_enabled?: boolean | null
  loyalty_shadow?: boolean | null
  multi_branch_enabled?: boolean | null
  promotion_banners?: unknown
  is_promotion_visible?: boolean | null
  announcement_text?: string | null
  is_announcement_visible?: boolean | null
}

interface ConfigOrderType {
  type: string
  is_enabled?: boolean | null
  available_on_web?: boolean | null
}

export interface AppConfigInput {
  tenant: ProjectableTenant
  /** `tenant_app_configs.published`; null until App Studio publishes. */
  published: unknown
  orderTypes: readonly ConfigOrderType[]
  outlets: readonly (ModeCapableOutlet & { is_active: boolean })[]
  now: Date
}

const MAX_BANNERS = 10
const TITLE_MAX = 80
const SUBTITLE_MAX = 140
const ANNOUNCEMENT_MAX = 160

const DEFAULT_COPY = {
  greeting: 'Good to see you',
  guestJoinTitle: 'Join and earn rewards',
  guestJoinBody: 'Sign in with your number to collect a stamp on every order.',
}

/** What App Studio publishes into `tenant_app_configs.published` (and keeps as `draft`). */
export const appPublishedConfigSchema = z.object({
  copy: appCopySchema.partial().optional(),
  theme: z.object({ fontKey: z.enum(APP_FONT_KEYS).optional(), corners: z.enum(APP_CORNER_STYLES).optional() }).optional(),
  home: appConfigSchema.shape.home.optional(),
})

export type AppPublishedConfig = z.infer<typeof appPublishedConfigSchema>
type Published = AppPublishedConfig

function readPublished(raw: unknown): Published {
  const parsed = appPublishedConfigSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined)

function storeBanners(tenant: ProjectableTenant): AppBanner[] {
  if (tenant.is_promotion_visible !== true) return []
  return normalizeBannerList(tenant.promotion_banners)
    .filter((banner) => banner.imageUrl.startsWith('https://'))
    .slice(0, MAX_BANNERS)
    .map((banner) => ({
      id: banner.id,
      imageUrl: banner.imageUrl,
      title: clip(banner.title, TITLE_MAX),
      subtitle: clip(banner.description, SUBTITLE_MAX),
      action: { type: 'none' as const },
    }))
}

function projectFeatures(input: AppConfigInput): AppFeatures {
  const { tenant, orderTypes, outlets, now } = input
  const multiBranch = isMultiBranchEnabled(tenant)
  const typeModes = new Set(modesFromOrderTypes(orderTypes))
  const branchModes = multiBranch ? new Set(resolveAvailableModes(outlets)) : null
  const offers = (mode: 'pickup' | 'delivery' | 'dine_in') => typeModes.has(mode) && (branchModes?.has(mode) ?? true)
  return {
    ordering: !getStoreOpenStatus(tenant, now).isOrderingBlocked,
    loyalty: isLoyaltyLive(tenant),
    // No online payment gateway exists yet (PayMongo is Phase 6).
    onlinePayments: false,
    multiBranch,
    orderModes: { pickup: offers('pickup'), delivery: offers('delivery'), dineIn: offers('dine_in') },
  }
}

function quickActionsFor(features: AppFeatures): AppQuickAction[] {
  const modes: AppQuickAction[] = []
  if (features.orderModes.pickup) modes.push('pickup')
  if (features.orderModes.delivery) modes.push('delivery')
  if (features.orderModes.dineIn) modes.push('dineIn')
  return modes.length > 0 ? modes : ['menu']
}

function defaultHome(tenant: ProjectableTenant, features: AppFeatures): AppHomeBlock[] {
  const banners = storeBanners(tenant)
  const announcement = typeof tenant.announcement_text === 'string' ? tenant.announcement_text.trim() : ''
  const blocks: (AppHomeBlock | null)[] = [
    features.loyalty ? { id: 'member', type: 'memberCard', visibleWhen: 'always' } : null,
    announcement && tenant.is_announcement_visible === true
      ? { id: 'announcement', type: 'announcement', visibleWhen: 'always', text: announcement.slice(0, ANNOUNCEMENT_MAX), tone: 'info' }
      : null,
    banners.length > 0
      ? { id: 'banners', type: 'bannerCarousel', visibleWhen: 'always', format: 'landscape', autoplay: true, banners }
      : null,
    { id: 'actions', type: 'quickActions', visibleWhen: 'always', actions: quickActionsFor(features) },
    { id: 'again', type: 'orderAgain', visibleWhen: 'member', title: 'Order again' },
    { id: 'featured', type: 'featuredItems', visibleWhen: 'always', title: 'Our favourites', source: 'featured', itemIds: [] },
    { id: 'menu', type: 'categoriesRail', visibleWhen: 'always', title: 'Browse the menu' },
    features.loyalty
      ? { id: 'rewards', type: 'rewardsTeaser', visibleWhen: 'guest', title: 'Every order counts', body: DEFAULT_COPY.guestJoinBody }
      : null,
  ]
  return blocks.filter((block): block is AppHomeBlock => block !== null)
}

export function projectAppConfig(input: AppConfigInput): AppConfig {
  const { tenant } = input
  const published = readPublished(input.published)
  const features = projectFeatures(input)
  const theme = projectAppTheme(tenant)
  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, currency: 'PHP' },
    theme: {
      ...theme,
      fontKey: published.theme?.fontKey ?? theme.fontKey,
      corners: published.theme?.corners ?? theme.corners,
    },
    features,
    copy: { ...DEFAULT_COPY, ...published.copy },
    home: { blocks: published.home?.blocks ?? defaultHome(tenant, features) },
  }
}
