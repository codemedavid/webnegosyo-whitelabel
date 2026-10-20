/**
 * The Product detail screen's settings: the page's own sections (stored in
 * `product_detail_settings`) followed by the store-wide wording it shows
 * (stored on `tenants`, e.g. "You might also like"). One list, so tapping an
 * item-page label edits it without leaving the item page.
 */

import { BRANDING_SURFACES, type BrandingSection } from '@/lib/branding-registry'
import { PRODUCT_DETAIL_SECTIONS } from '@/lib/product-detail-registry'

const PRODUCT_TENANT_SECTIONS: readonly BrandingSection[] = (
    BRANDING_SURFACES.find((surface) => surface.id === 'product')?.sections ?? []
).filter((section) => section.fields.some((field) => field.type !== 'note'))

const TENANT_FIELD_IDS = new Set(PRODUCT_TENANT_SECTIONS.flatMap((section) => section.fields.map((field) => field.id)))

export const PRODUCT_SURFACE_SECTIONS: readonly BrandingSection[] = [...PRODUCT_DETAIL_SECTIONS, ...PRODUCT_TENANT_SECTIONS]

/** Field ids on the Product screen that live on the tenant, not in product settings. */
export const PRODUCT_SURFACE_TENANT_FIELD_IDS: readonly string[] = [...TENANT_FIELD_IDS]

/** True when a Product-screen field is a tenant column (edited through the tenant draft). */
export function isProductSurfaceTenantField(fieldId: string): boolean {
    return TENANT_FIELD_IDS.has(fieldId)
}
