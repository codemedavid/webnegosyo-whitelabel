import type { Category, MenuItem, Tenant, Outlet, OutletMenuOverride, BundleWithSlots, PromotionBanner } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'
import type { StoreOpenStatus } from '@/lib/store-open-status'

export interface StorefrontMenuInput {
  tenant: Tenant | null
  categories: Category[]
  allMenuItems: MenuItem[]
  bundles: BundleWithSlots[]
  outlets: Outlet[]
  /** True when the branch query failed — ordering is blocked, the menu is not. */
  outletsFailed?: boolean
  /** Every per-branch listing/price override the tenant has. */
  menuOverrides?: OutletMenuOverride[]
  /** True when the override query failed — same treatment as `outletsFailed`. */
  overridesFailed?: boolean
  tenantSlug: string
  isBrandAdmin: boolean
  status?: 'ready' | 'not-found' | 'error'
  error: string | null
}

/** Presentation contract shared by every catalog layout. No routing or cart internals. */
export interface MenuLayoutContentProps {
  tenant: Tenant | null
  tenantSlug: string
  categories: Category[]
  filteredItems: MenuItem[]
  /** Search matches before category filtering, for scroll-based catalogs. */
  searchItems?: MenuItem[]
  allMenuItems: MenuItem[]
  activeCategory: string | null
  setActiveCategory: (id: string | null) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
  cardTemplate: CardTemplate
  isLoading?: boolean
  heroOverride?: { title?: string; description?: string; heroTitleColor?: string; heroDescriptionColor?: string } | null
  bannerOverride?: { promotionBanners?: PromotionBanner[]; isPromotionVisible?: boolean } | null
  currentSlide: number
  setCurrentSlide: (slide: number) => void
  mobileGridColumns?: number
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/** Stable commands/data for a whole storefront view, independent of its markup. */
export interface StorefrontMenuController {
  tenant: Tenant | null
  tenantSlug: string
  categories: Category[]
  allMenuItems: MenuItem[]
  categoriesWithBundles: Category[]
  filteredItems: MenuItem[]
  searchItems: MenuItem[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeCategory: string | null
  setActiveCategory: (id: string | null) => void
  itemCount: number
  openStatus: StoreOpenStatus
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
  selectedBundle: BundleWithSlots | null
  closeBundle: () => void
  sheetItem: MenuItem | null
  closeProduct: () => void
  selectItem: (item: MenuItem) => void
}
