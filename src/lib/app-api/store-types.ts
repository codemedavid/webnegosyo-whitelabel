import type { readOrderTypes, readPaymentMethods } from '@/lib/checkout/load-checkout-config'
import type { MenuContents } from '@/storefront/data/menu-data'

/**
 * The store data the customer app's server works with, typed from the reads
 * that produce it: the storefront menu snapshot (`getStorefrontMenu`, the same
 * cached read `/api/app/v1/catalog` serves) and the checkout config readers.
 * When one of those reads changes shape, these follow it; nothing here is
 * declared a second time.
 */
export type MenuItem = MenuContents['menuItems'][number]
export type Category = MenuContents['categories'][number]
export type Outlet = MenuContents['outlets'][number]
export type ModifierGroup = NonNullable<MenuItem['modifier_groups']>[number]
export type ModifierOption = ModifierGroup['options'][number]
export type Addon = MenuItem['addons'][number]
export type OrderType = Awaited<ReturnType<typeof readOrderTypes>>[number]
export type PaymentMethod = Awaited<ReturnType<typeof readPaymentMethods>>[number]
