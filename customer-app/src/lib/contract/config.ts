import { z } from 'zod'
import { httpsUrlSchema } from './primitives'
import { appThemeSchema } from './theme'

/** Where a banner tap goes. `url` is https-only; everything else stays in the app. */
export const appBannerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('item'), itemId: z.string().min(1) }),
  z.object({ type: z.literal('category'), categoryId: z.string().min(1) }),
  z.object({ type: z.literal('rewards') }),
  z.object({ type: z.literal('url'), url: httpsUrlSchema }),
])

export type AppBannerAction = z.infer<typeof appBannerActionSchema>

export const appBannerSchema = z.object({
  id: z.string().min(1),
  imageUrl: httpsUrlSchema,
  title: z.string().max(80).optional(),
  subtitle: z.string().max(140).optional(),
  action: appBannerActionSchema.optional(),
})

export type AppBanner = z.infer<typeof appBannerSchema>

/** Who sees a block: signed-out browsers, signed-in members, or everyone. */
export const APP_BLOCK_AUDIENCES = ['always', 'guest', 'member'] as const
export type AppBlockAudience = (typeof APP_BLOCK_AUDIENCES)[number]

export const APP_QUICK_ACTIONS = ['pickup', 'delivery', 'dineIn', 'menu', 'rewards', 'scan'] as const
export type AppQuickAction = (typeof APP_QUICK_ACTIONS)[number]

const blockBase = {
  id: z.string().min(1).max(40),
  visibleWhen: z.enum(APP_BLOCK_AUDIENCES),
}

export const appHomeBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...blockBase, type: z.literal('memberCard') }),
  z.object({
    ...blockBase,
    type: z.literal('bannerCarousel'),
    format: z.enum(['landscape', 'square', 'portrait']),
    autoplay: z.boolean(),
    banners: z.array(appBannerSchema).max(10),
  }),
  z.object({
    ...blockBase,
    type: z.literal('quickActions'),
    actions: z.array(z.enum(APP_QUICK_ACTIONS)).min(1).max(4),
  }),
  z.object({
    ...blockBase,
    type: z.literal('featuredItems'),
    title: z.string().min(1).max(60),
    /** `featured` = the menu's featured flag; `manual` = exactly `itemIds`, in order. */
    source: z.enum(['featured', 'manual']),
    itemIds: z.array(z.string().min(1)).max(20),
  }),
  z.object({ ...blockBase, type: z.literal('categoriesRail'), title: z.string().min(1).max(60) }),
  z.object({
    ...blockBase,
    type: z.literal('rewardsTeaser'),
    title: z.string().min(1).max(60),
    body: z.string().max(200),
  }),
  z.object({
    ...blockBase,
    type: z.literal('announcement'),
    text: z.string().min(1).max(160),
    tone: z.enum(['info', 'promo', 'warning']),
  }),
  z.object({ ...blockBase, type: z.literal('orderAgain'), title: z.string().min(1).max(60) }),
])

export type AppHomeBlock = z.infer<typeof appHomeBlockSchema>
export type AppHomeBlockType = AppHomeBlock['type']

export const appFeaturesSchema = z.object({
  ordering: z.boolean(),
  loyalty: z.boolean(),
  onlinePayments: z.boolean(),
  multiBranch: z.boolean(),
  orderModes: z.object({ pickup: z.boolean(), delivery: z.boolean(), dineIn: z.boolean() }),
})

export type AppFeatures = z.infer<typeof appFeaturesSchema>

export const appCopySchema = z.object({
  greeting: z.string().min(1).max(40),
  guestJoinTitle: z.string().min(1).max(60),
  guestJoinBody: z.string().max(160),
})

export const appConfigSchema = z.object({
  tenant: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    currency: z.literal('PHP'),
  }),
  theme: appThemeSchema,
  features: appFeaturesSchema,
  copy: appCopySchema,
  home: z.object({
    blocks: z
      .array(appHomeBlockSchema)
      .max(20)
      .refine((blocks) => new Set(blocks.map((block) => block.id)).size === blocks.length, 'Block ids must be unique'),
  }),
})

export type AppConfig = z.infer<typeof appConfigSchema>
