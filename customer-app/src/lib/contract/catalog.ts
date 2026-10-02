import { z } from 'zod'
import { httpsUrlSchema, pesoAmountSchema } from './primitives'

export const appModifierOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Added to the item's base price per unit; never negative on the wire. */
  priceDelta: pesoAmountSchema,
  imageUrl: httpsUrlSchema.nullable(),
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
})

export type AppModifierOption = z.infer<typeof appModifierOptionSchema>

/**
 * One unified group (sizes, milks, add-ons). `maxSelect === 1` is a single
 * choice; `null` is unlimited. `quantity` groups let one option be picked
 * more than once.
 */
export const appModifierGroupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    selectionMode: z.enum(['choice', 'quantity']),
    minSelect: z.number().int().nonnegative(),
    maxSelect: z.number().int().positive().nullable(),
    options: z.array(appModifierOptionSchema),
  })
  .refine((group) => group.maxSelect === null || group.maxSelect >= group.minSelect, 'maxSelect is below minSelect')

export type AppModifierGroup = z.infer<typeof appModifierGroupSchema>

export const appMenuItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  price: pesoAmountSchema,
  /** A struck-through "was" price; null when there is no discount. */
  compareAtPrice: pesoAmountSchema.nullable(),
  imageUrl: httpsUrlSchema.nullable(),
  badge: z.string().max(24).nullable(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  modifierGroups: z.array(appModifierGroupSchema),
})

export type AppMenuItem = z.infer<typeof appMenuItemSchema>

export const appCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  imageUrl: httpsUrlSchema.nullable(),
})

export type AppCategory = z.infer<typeof appCategorySchema>

export const APP_ORDER_KINDS = ['dine_in', 'pickup', 'delivery', 'grab', 'foodpanda', 'other'] as const
export type AppOrderKind = (typeof APP_ORDER_KINDS)[number]

export const appOrderTypeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(APP_ORDER_KINDS),
  name: z.string().min(1),
  minimumOrder: pesoAmountSchema,
})

export type AppOrderType = z.infer<typeof appOrderTypeSchema>

export const appOutletSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  imageUrl: httpsUrlSchema.nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  supportsPickup: z.boolean(),
  supportsDelivery: z.boolean(),
  supportsDineIn: z.boolean(),
})

export type AppOutlet = z.infer<typeof appOutletSchema>

export const appPairingSchema = z.object({
  sourceItemId: z.string().min(1),
  targetItemIds: z.array(z.string().min(1)).max(6),
})

export const appCatalogSchema = z.object({
  /** Changes whenever the menu does; the app uses it to drop a stale cart line. */
  version: z.string().min(1),
  categories: z.array(appCategorySchema),
  items: z.array(appMenuItemSchema),
  orderTypes: z.array(appOrderTypeSchema),
  outlets: z.array(appOutletSchema),
  pairings: z.array(appPairingSchema),
})

export type AppCatalog = z.infer<typeof appCatalogSchema>
