import { z } from 'zod'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { createTenantSupabase, updateTenantSupabase, listTenantsSupabase, getTenantBySlugSupabase } from '@/lib/tenants-service'
import {
    createCategory,
    createMenuItem,
    updateMenuItemImage,
    setMenuItemImageFromData,
    setMenuItemImageFromUrl,
    updateMenuItemFields,
    listMenuItemsForProvisioning,
    listCategoriesForProvisioning,
    updateCategoryFields,
} from '@/lib/admin-service'
import { createAddonLibraryEntry, listAddonLibraryForProvisioning } from '@/lib/addon-library-service'
import { attachAddonEntriesToItems } from '@/lib/addon-bulk-attach'
import { createUpsellPair, updateUpsellPair, bulkUpdateBcgClassification, listUpsellPairsForProvisioning } from '@/lib/menu-engineering-service'
import { classifyMenu } from '@/lib/menu-engineering-classify'
import { reorderCategoriesForProvisioning, reorderMenuItemsForProvisioning } from '@/lib/menu-arrangement'
import { createBundle, updateBundle, updateBundleFields, setBundleImage, listBundlesForProvisioning } from '@/lib/bundles-service'
import { createTenantOwnerWithClient, listTenantUsersWithClient } from '@/lib/tenant-owner-provisioning'
import {
    setTenantImage,
    addTenantBanner,
    updateTenantBanner,
    clearTenantBanner,
    listTenantBanners,
    readBrandingSnapshot,
    resolveTenantSlug,
} from '@/lib/branding-images'
import { describeBrandingOptions, listBrandingFieldIds } from '@/lib/branding-options'
import { CURATED_ICON_GROUPS, LUCIDE_PREFIX, isKnownCategoryIcon, isValidCategoryIconColor } from '@/lib/category-icon-catalog'
import { assertSingleImageSource, pickImageSource, type ImageSource } from '@/lib/image-source'
import { withFeatureWarning, type TenantFeatureFlags } from '@/lib/mcp/feature-flag-warnings'
import { createPaymentMethod } from '@/lib/payment-methods-service'
import { saveBrandingAction } from '@/app/actions/branding'
import { brandingPatchSchema, type BrandingPatchInput } from '@/lib/branding-service'
import { fetchMenuPerformanceForTenantId } from '@/lib/queries/menu-performance'
import { fetchSalesSummaryForTenantId } from '@/lib/queries/sales-summary'
import { launchProduct } from '@/lib/mcp/launch-product'
import { fetchUpsellPerformanceForTenantId } from '@/lib/queries/upsell-performance'
import { createSmsCampaign, listSmsCampaignsForProvisioning } from '@/lib/sms-campaigns-service'
import { assertNonDestructiveOpName, assertNoTenantDeactivation } from '@/lib/mcp/op-safety'

/**
 * A provisioning operation is the unit both the remote MCP tools and any REST
 * layer dispatch to. Each op advertises a name + description + a Zod envelope
 * schema, and executes against the injected service-role client (ctx).
 *
 * Deep field validation lives in the underlying service writers (single source
 * of truth); an op's `input` schema only guards the envelope shape (e.g. that a
 * tenantId is present and that nested objects exist), then delegates.
 */
export interface ProvisioningOp<I = unknown> {
    name: string
    description: string
    readOnly?: boolean
    input: z.ZodType<I>
    execute: (ctx: ProvisioningCtx, input: I) => Promise<unknown>
}

const UUID = z.string().uuid()

/**
 * `{ tenantId, ...rest }` as a passthrough ZodObject. It MUST be a ZodObject (not
 * an intersection or record): the MCP SDK advertises a tool's JSON schema by
 * running the Zod `input` through `normalizeObjectSchema`, which only recognizes
 * raw shapes and ZodObjects — anything else normalizes to `undefined` and the SDK
 * then advertises an empty `{ type: 'object', properties: {} }`, leaving the model
 * with no fields to send. `.passthrough()` keeps the "service validates the rest"
 * design (extra keys flow through untouched) while still exposing `.shape`.
 */
function tenantScoped<S extends z.ZodRawShape>(extra?: S) {
    return z.object(extra ? { tenantId: UUID, ...extra } : { tenantId: UUID }).passthrough()
}

/**
 * create_tenant envelope. Advertises the fields the model must supply (deep
 * validation still runs in createTenantSupabase via tenantSchema); `.passthrough()`
 * lets any additional tenant column flow through. See tenantScoped for why this
 * has to be a ZodObject rather than a bare record.
 */
const createTenantEnvelope = z
    .object({
        name: z.string().min(2).describe('Restaurant / tenant display name'),
        slug: z.string().min(2).describe('URL slug: lowercase letters, numbers and dashes only'),
        primary_color: z.string().min(1).describe('Primary brand color, hex (e.g. #1a1a1a)'),
        secondary_color: z.string().min(1).describe('Secondary brand color, hex'),
        messenger_page_id: z.string().min(1).describe('Facebook Messenger page id that receives orders'),
        domain: z.string().optional().describe('Optional custom domain (e.g. shop.example.com)'),
        logo_url: z.string().optional().describe('Optional logo image URL'),
        accent_color: z.string().optional().describe('Optional accent color, hex'),
    })
    .passthrough()

/** Strips tenantId from an envelope, returning the remaining payload. */
function withoutTenantId(input: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...input }
    delete rest.tenantId
    return rest
}

/**
 * Read the per-tenant flags that gate bundles and upsells.
 *
 * A failed read reports every flag as absent, which `featureWarningFor` treats
 * as OFF — so an unreadable tenant produces a warning rather than a confident
 * silence. Warning about a live feature is a small annoyance; staying silent
 * about a dead one is how a merchant ends up with promos nobody can see.
 */
async function readTenantFeatureFlags(tenantId: string, ctx: ProvisioningCtx): Promise<TenantFeatureFlags> {
    try {
        const { data, error } = await ctx.client
            .from('tenants')
            .select('bundles_enabled, menu_engineering_enabled, checkout_upsell_enabled')
            .eq('id', tenantId)
            .single()

        if (error || !data) return {}
        return data as unknown as TenantFeatureFlags
    } catch {
        return {}
    }
}

// Erase the type parameter when storing in the heterogeneous registry. Each op
// keeps its own typed schema/execute internally; the registry treats them
// uniformly as ProvisioningOp<unknown> (input.parse → unknown → execute).
function op<I>(o: ProvisioningOp<I>): ProvisioningOp<unknown> {
    return o as unknown as ProvisioningOp<unknown>
}

const ops: ProvisioningOp<unknown>[] = [
    op({
        name: 'create_tenant',
        description: 'Create a new white-labeled tenant (restaurant). Requires name, slug, primary/secondary colors and a Messenger page id.',
        input: createTenantEnvelope,
        execute: (ctx, input) => createTenantSupabase(input as never, ctx),
    }),
    op({
        name: 'add_category',
        description: 'Add a menu category to a tenant. Envelope: { tenantId, name, description?, icon?, icon_color?, order?, display_layout? }. icon is "lucide:<name>" from list_category_icons (or a single emoji); icon_color is a hex like #FF6B00.',
        input: tenantScoped({
            name: z.string().min(2).describe('Category display name'),
            description: z.string().optional(),
            icon: z.string().optional().describe('"lucide:<name>" from list_category_icons, or one emoji'),
            icon_color: z.string().optional().describe('6-digit hex tint for the icon, e.g. #FF6B00'),
            order: z.number().int().min(0).optional().describe('Position in the menu (0 = first)'),
            display_layout: z.enum(['grid', 'horizontal_scroll', 'horizontal_mobile_only', 'horizontal_desktop_only']).optional(),
        }),
        execute: (ctx, input) => createCategory((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
    }),
    op({
        name: 'add_menu_item',
        description: 'Add a menu item (with variations/addons) to a tenant. Envelope: { tenantId, name, price, category_id, ... }.',
        input: tenantScoped(),
        execute: (ctx, input) => createMenuItem((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
    }),
    op({
        name: 'update_menu_item_image',
        description:
            "Set an existing menu item's image to an already-hosted image URL (the MCP cannot upload binary files). Envelope: { tenantId, itemId, imageUrl }. Use list_menu_items first to resolve itemId by name.",
        input: z.object({
            tenantId: UUID,
            itemId: UUID.describe('Id of the existing menu item to update'),
            imageUrl: z.string().url().describe('Publicly reachable image URL to set on the item'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; itemId: string; imageUrl: string }
            return updateMenuItemImage(i.itemId, i.tenantId, i.imageUrl, ctx)
        },
    }),
    op({
        name: 'update_menu_item',
        description:
            "Update fields of an EXISTING menu item (partial — only the fields you pass are changed; omit the rest). Editable: name, description, price, discounted_price, category_id, variation_types (grouped size/spice etc.), variations (legacy flat), addons, is_available, is_featured, badge_text, show_in_checkout_upsell, order. Envelope: { tenantId, itemId, ...fields }. Use list_menu_items first to resolve itemId by name. For the item's image use upload_menu_item_image (bytes) or update_menu_item_image (hosted URL).",
        input: z
            .object({
                tenantId: UUID,
                itemId: UUID.describe('Id of the existing menu item to update (resolve via list_menu_items)'),
                name: z.string().optional().describe('New display name (min 2 chars)'),
                description: z.string().optional().describe('New description (min 10 chars)'),
                price: z.number().optional().describe('New base price'),
                discounted_price: z.number().nullable().optional().describe('Sale price, or null to clear'),
                category_id: UUID.optional().describe('Move the item to a different category'),
                variation_types: z.array(z.unknown()).optional().describe('Grouped variation types with nested options; replaces the current set'),
                variations: z.array(z.unknown()).optional().describe('Legacy flat variations; replaces the current set'),
                addons: z.array(z.unknown()).optional().describe('Addon list; replaces the current set'),
                is_available: z.boolean().optional(),
                is_featured: z.boolean().optional(),
                badge_text: z.string().nullable().optional(),
                show_in_checkout_upsell: z.boolean().optional(),
                order: z.number().int().optional(),
            })
            .passthrough(),
        execute: (ctx, input) => {
            const record = input as Record<string, unknown>
            const { tenantId, itemId } = record as { tenantId: string; itemId: string }
            const fields = { ...record }
            delete fields.tenantId
            delete fields.itemId
            return updateMenuItemFields(itemId, tenantId, fields as never, ctx)
        },
    }),
    op({
        name: 'upload_menu_item_image',
        description:
            "Upload a generated/local image (base64) to hosting and set it as an existing menu item's image — use this when you have image bytes but no public URL. Envelope: { tenantId, itemId, imageBase64, fileName }. imageBase64 may be a raw base64 string or a data: URI. Use list_menu_items first to resolve itemId by name. For an already-hosted image, use update_menu_item_image instead.",
        input: z.object({
            tenantId: UUID,
            itemId: UUID.describe('Id of the existing menu item to update'),
            imageBase64: z.string().min(1).describe('Image bytes as base64 (raw or a data: URI)'),
            fileName: z.string().min(1).describe('File name for the upload, e.g. "biscoff-frappe.png"'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; itemId: string; imageBase64: string; fileName: string }
            return setMenuItemImageFromData(i.itemId, i.tenantId, i.imageBase64, i.fileName, ctx)
        },
    }),
    op({
        name: 'import_menu_item_image_from_url',
        description:
            "PREFERRED way to set a menu item's photo from a link: downloads the image at sourceUrl, re-hosts it on the platform's own image CDN (ImageKit), then sets it on the item. Accepts Google Drive / Dropbox share links (rewritten to their direct-download form) and ordinary image URLs. Envelope: { tenantId, itemId, sourceUrl, fileName? }. Use list_menu_items first to resolve itemId (match the item code such as D1 / SP1 in the name or description). Call once per item. Fails without touching the item if the link does not serve an actual image — a Drive link must be shared as 'Anyone with the link'.",
        input: z.object({
            tenantId: UUID,
            itemId: UUID.describe('Id of the existing menu item to update (resolve via list_menu_items)'),
            sourceUrl: z.string().url().describe('Link to the source image (Drive/Dropbox share link or direct image URL)'),
            fileName: z
                .string()
                .min(1)
                .optional()
                .describe('Optional name to store the asset under, e.g. "D1-sizzling-sisig.jpg"'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; itemId: string; sourceUrl: string; fileName?: string }
            return setMenuItemImageFromUrl(i.itemId, i.tenantId, i.sourceUrl, i.fileName, ctx)
        },
    }),
    op({
        name: 'add_addon_library_entry',
        description: 'Create a reusable addon-library entry (shared addon group) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: (ctx, input) => createAddonLibraryEntry((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
    }),
    op({
        name: 'create_upsell_pair',
        description: 'Create an upsell pair (complementary or upgrade) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: async (ctx, input) => {
            const tenantId = (input as { tenantId: string }).tenantId
            const [pair, flags] = await Promise.all([
                createUpsellPair(tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
                readTenantFeatureFlags(tenantId, ctx),
            ])
            return withFeatureWarning(pair, 'upsells', flags)
        },
    }),
    op({
        name: 'create_bundle',
        description: 'Create a menu bundle (fixed or discount pricing) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: async (ctx, input) => {
            const tenantId = (input as { tenantId: string }).tenantId
            const [bundle, flags] = await Promise.all([
                createBundle(tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
                readTenantFeatureFlags(tenantId, ctx),
            ])
            return withFeatureWarning(bundle, 'bundles', flags)
        },
    }),
    op({
        name: 'add_payment_method',
        description: 'Add a payment method to a tenant. Envelope: { tenantId, name, details?, qrCodeUrl?, isActive?, orderTypes?, requirePaymentProof?, skipPaymentDetails? }.',
        input: z.object({
            tenantId: UUID,
            name: z.string().min(1),
            details: z.string().optional(),
            qrCodeUrl: z.string().optional(),
            isActive: z.boolean().optional(),
            orderTypes: z.array(z.string()).optional(),
            requirePaymentProof: z.boolean().optional(),
            skipPaymentDetails: z.boolean().optional(),
        }),
        execute: (ctx, input) => {
            const i = input as {
                tenantId: string; name: string; details?: string; qrCodeUrl?: string
                isActive?: boolean; orderTypes?: string[]; requirePaymentProof?: boolean
                skipPaymentDetails?: boolean
            }
            return createPaymentMethod(i.tenantId, i.name, i.details, i.qrCodeUrl, i.isActive ?? true, i.orderTypes ?? [], i.requirePaymentProof ?? false, i.skipPaymentDetails ?? false, ctx)
        },
    }),
    op({
        name: 'update_branding',
        description: 'Partially update a tenant\'s branding (logo, colors, templates, hero, footer, welcome page). Only include fields that should change. Call get_branding first to see current values and the allowed options for every select field. Envelope: { tenantId, branding: {...} }. For images use set_branding_image / add_banner instead of pasting URLs.',
        input: z.object({
            tenantId: UUID,
            tenantSlug: z.string().min(1).optional().describe('Optional; resolved from tenantId when omitted'),
            branding: brandingPatchSchema,
        }),
        execute: async (ctx, input) => {
            const i = input as { tenantId: string; tenantSlug?: string; branding: BrandingPatchInput }
            const slug = i.tenantSlug ?? (await resolveTenantSlug(ctx, i.tenantId))
            return saveBrandingAction(i.tenantId, slug, i.branding, ctx)
        },
    }),
    op({
        name: 'configure_integration',
        description: 'Configure a tenant\'s integrations/settings (Lalamove, distance delivery, feature flags, Convex). Envelope: { tenantId, ...tenant fields }.',
        input: tenantScoped(),
        execute: (ctx, input) => {
            const payload = withoutTenantId(input as Record<string, unknown>)
            assertNoTenantDeactivation(payload)
            return updateTenantSupabase((input as { tenantId: string }).tenantId, payload as never, ctx)
        },
    }),
    op({
        name: 'create_sms_campaign',
        description:
            "Create an SMS follow-up campaign to announce a promo or bundle. Envelope: { tenantId, name, message_template, schedule_kind, ... }. message_template supports {{firstName}} placeholders. schedule_kind is 'one_off' (needs schedule_date), 'every_n_days' (needs schedule_interval_days) or 'weekly' (needs schedule_weekdays, ISO 1=Mon..7=Sun) — a kind missing its steering field is refused, because it would never become due. SAVED AS A DRAFT unless you explicitly pass status:'active'; a draft never sends until a staff member activates it in the merchant Android app. Sending is done by that handset, not by this tool, and only to customers who gave SMS consent at checkout — nothing here can create or change consent.",
        input: tenantScoped({
            name: z.string().min(1).describe('Campaign name, for the merchant to recognise it'),
            message_template: z.string().min(1).describe('Message body; {{firstName}} is substituted per recipient'),
            schedule_kind: z.enum(['one_off', 'every_n_days', 'weekly']).describe('How it recurs'),
            schedule_date: z.string().optional().describe('one_off only: "YYYY-MM-DD"'),
            schedule_interval_days: z.number().int().positive().optional().describe('every_n_days only'),
            schedule_weekdays: z.array(z.number().int().min(1).max(7)).optional().describe('weekly only: ISO weekdays'),
            schedule_time: z.string().optional().describe('Local Manila send time "HH:MM" (default 10:00)'),
            audience: z
                .object({
                    lastOrderOlderThanDays: z.number().int().positive().optional(),
                    lastOrderWithinDays: z.number().int().positive().optional(),
                    minOrderCount: z.number().int().nonnegative().optional(),
                    minTotalSpent: z.number().nonnegative().optional(),
                    channels: z.array(z.string()).optional(),
                })
                .optional()
                .describe('Recipient filter; all fields AND together'),
            max_per_run: z.number().int().min(1).max(200).optional().describe('Messages per run (default 25)'),
            status: z.enum(['draft', 'active', 'paused', 'archived']).optional().describe("Defaults to 'draft'"),
        }),
        execute: (ctx, input) => {
            const tenantId = (input as { tenantId: string }).tenantId
            return createSmsCampaign(tenantId, withoutTenantId(input as Record<string, unknown>), ctx)
        },
    }),
    // Reads
    op({
        name: 'list_sms_campaigns',
        description:
            "List a tenant's SMS campaigns (name, status, schedule, message) so you can see what is already running before creating another. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listSmsCampaignsForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'list_bundles',
        description:
            "List a tenant's existing bundles (id, name, pricing, visibility flags) so you can see what is already built before creating a near-duplicate. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listBundlesForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'list_upsell_pairs',
        description:
            "List a tenant's existing upsell pairs (source, target, type, active) so you can see current coverage before proposing more. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listUpsellPairsForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'list_tenants',
        description: 'List all tenants (id, name, slug). No input.',
        readOnly: true,
        input: z.object({}).passthrough(),
        execute: async () => {
            const { data, error } = await listTenantsSupabase()
            if (error) throw error
            return data.map(({ id, name, slug }) => ({ id, name, slug }))
        },
    }),
    op({
        name: 'list_menu_items',
        description: "List a tenant's menu items (id, name, image_url, price) so an item can be resolved by name before updating it. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listMenuItemsForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'list_categories',
        description:
            "List a tenant's menu categories (id, name, order, is_active) so a category_id can be resolved by name before adding or moving a menu item. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listCategoriesForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'attach_addon_library_entries',
        description:
            "Attach reusable add-on library entries to MANY menu items at once — the fast way to give a whole category (or every upsell target) the same modifiers. Envelope: { tenantId, itemIds, entryIds }. Existing add-ons on each item are PRESERVED, and an entry already present by name is skipped, so calling this twice is safe. Resolve entryIds via list_addon_library and itemIds via list_menu_items. To REMOVE an add-on from an item, send the full replacement array via update_menu_item — this surface has no removal tool by design.",
        input: z.object({
            tenantId: UUID,
            itemIds: z.array(UUID).min(1).describe('Menu items that should gain these add-ons'),
            entryIds: z.array(UUID).min(1).describe('Add-on library entries to attach'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; itemIds: string[]; entryIds: string[] }
            return attachAddonEntriesToItems(i.tenantId, i.itemIds, i.entryIds, ctx)
        },
    }),
    op({
        name: 'list_addon_library',
        description:
            "List a tenant's reusable add-on library (id, name, price) so an entry can be resolved by name before attaching it. Envelope: { tenantId }.",
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listAddonLibraryForProvisioning((input as { tenantId: string }).tenantId, ctx),
    }),
    op({
        name: 'reorder_categories',
        description:
            "Set the top-to-bottom order of a tenant's menu categories — the cheapest menu-engineering lever there is. Envelope: { tenantId, categoryIds }. categoryIds must list EVERY category exactly once, first shown first; a partial list is refused, because writing `order` rewrites the whole column and the omitted categories would keep stale positions and interleave. Call list_categories first to get the full set.",
        input: z.object({
            tenantId: UUID,
            categoryIds: z
                .array(UUID)
                .min(1)
                .describe('Every category id, in the order they should appear (first = top)'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; categoryIds: string[] }
            return reorderCategoriesForProvisioning(i.tenantId, i.categoryIds, ctx)
        },
    }),
    op({
        name: 'reorder_menu_items',
        description:
            "Set the order of the items WITHIN one category — put the stars where guests look first. Envelope: { tenantId, categoryId, itemIds }. itemIds must list every item in that category exactly once, first shown first; a partial list is refused. Call list_menu_items first and filter by category_id to get the full set.",
        input: z.object({
            tenantId: UUID,
            categoryId: UUID.describe('The category whose items are being ordered'),
            itemIds: z
                .array(UUID)
                .min(1)
                .describe('Every item id in that category, in the order they should appear'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; categoryId: string; itemIds: string[] }
            return reorderMenuItemsForProvisioning(i.tenantId, i.categoryId, i.itemIds, ctx)
        },
    }),
    op({
        name: 'classify_menu',
        description:
            "PROPOSE a BCG menu-engineering classification (star / plowhorse / puzzle / dog) for every item, computed from the tenant's real sales. Writes NOTHING — review the proposal, then pass the ones you want to keep to apply_menu_classification. Envelope: { tenantId, days?, costs? }. `costs` maps itemId → unit cost; supply it for EVERY item to get true contribution margins, otherwise profitability falls back to a price proxy and `marginBasis` will say 'price_proxy'. When `canApply` is false the evidence was too weak (blind or thin sales read) and you must NOT write classifications or advise removing items — read the `warnings`.",
        input: z.object({
            tenantId: UUID,
            days: z.number().int().min(1).max(365).optional().describe('Sales window in days (default 30)'),
            costs: z
                .record(z.string(), z.number())
                .optional()
                .describe('itemId → unit cost. Partial coverage is ignored; all-or-nothing.'),
        }),
        execute: async (ctx, input) => {
            const i = input as { tenantId: string; days?: number; costs?: Record<string, number> }
            const [menuItems, performance] = await Promise.all([
                listMenuItemsForProvisioning(i.tenantId, ctx),
                fetchMenuPerformanceForTenantId(i.tenantId, ctx, i.days ?? 30),
            ])

            const items = ((menuItems ?? []) as Array<{ id: string; name: string; price: number; category_id: string | null }>)
                .map((m) => ({ id: m.id, name: m.name, price: Number(m.price), categoryId: m.category_id }))

            return { ...classifyMenu({ items, performance, costs: i.costs }), performance }
        },
    }),
    op({
        name: 'apply_menu_classification',
        description:
            "WRITE the BCG classifications you decided on after reviewing classify_menu. Envelope: { tenantId, classifications: [{ itemId, classification }] }. Only the items you list are changed. Do not call this when classify_menu reported canApply: false. Note that classifications only reach customers when the tenant's menu_engineering_enabled flag is on.",
        input: z.object({
            tenantId: UUID,
            classifications: z
                .array(
                    z.object({
                        itemId: UUID,
                        classification: z.enum(['star', 'plowhorse', 'puzzle', 'dog', 'unclassified']),
                    }),
                )
                .min(1, 'Pass at least one classification — an empty write is not a success.'),
        }),
        execute: (ctx, input) => {
            const i = input as {
                tenantId: string
                classifications: Array<{ itemId: string; classification: 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unclassified' }>
            }
            return bulkUpdateBcgClassification(i.tenantId, i.classifications, ctx)
        },
    }),
    op({
        name: 'get_menu_performance',
        description:
            "What actually SELLS: per-item units, revenue and share over the trailing window, read from whichever backend holds this tenant's orders (platform Supabase, the tenant's own Supabase project, or its Convex deployment). Envelope: { tenantId, days? }. ALWAYS call this before classifying a menu, arranging it, or proposing bundles/upsells. Check `coverage` in the response: when `coverage.complete` is false the read saw no data or only part of it — that is an ABSENCE of evidence, not proof that items sold nothing, and you must not classify a menu or recommend removing items from it.",
        input: z.object({
            tenantId: UUID,
            days: z
                .number()
                .int()
                .min(1)
                .max(365)
                .optional()
                .describe('Trailing window in days (default 30, max 365)'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; days?: number }
            return fetchMenuPerformanceForTenantId(i.tenantId, ctx, i.days ?? 30)
        },
    }),
    op({
        name: 'launch_product',
        description:
            "Take a new product live in ONE call: creates the menu item (with an optional badge), re-hosts its photo from a link, optionally wires a complementary upsell from an existing item to the new one, and returns the live menu URL. Envelope: { tenantId, name, price, categoryId, description?, badgeText?, imageUrl?, imageFileName?, suggestWithItemId? }. Check `image.status` and `upsell.status` in the result — the item stays LIVE even when an extra fails, so a 'failed' extra means retry that step (e.g. via import_menu_item_image_from_url), not the whole launch.",
        input: z.object({
            tenantId: UUID,
            name: z.string().min(1).describe('Product display name'),
            price: z.number().min(0).describe('Base price'),
            categoryId: UUID.describe('Category to list the product under (resolve via list_categories)'),
            description: z.string().optional(),
            badgeText: z.string().min(1).optional().describe('Overlay pill on the card, e.g. "NEW" (shows when menu engineering is enabled)'),
            imageUrl: z.string().url().optional().describe('Photo link (Drive/Dropbox share link or direct image URL)'),
            imageFileName: z.string().min(1).optional(),
            suggestWithItemId: UUID.optional().describe('Existing item that should suggest the new product after being added to cart'),
        }),
        execute: (ctx, input) => launchProduct(ctx, input as never),
    }),
    op({
        name: 'get_sales_summary',
        description:
            "How the store is doing overall: order count, revenue, average order value and a per-day series over the trailing window, read from whichever backend holds this tenant's orders. Envelope: { tenantId, days? }. Check `coverage`: when `coverage.complete` is false the read saw no data or only part of it — treat that as an ABSENCE of evidence, not as a slow store.",
        input: z.object({
            tenantId: UUID,
            days: z
                .number()
                .int()
                .min(1)
                .max(365)
                .optional()
                .describe('Trailing window in days (default 30, max 365)'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; days?: number }
            return fetchSalesSummaryForTenantId(i.tenantId, ctx, i.days ?? 30)
        },
    }),
    op({
        name: 'get_upsell_performance',
        description:
            'The upsell funnel (shown → clicked → converted, with rates) over the trailing window, read from the tenant\'s Convex analytics deployment. Envelope: { tenantId, days? }. When `available` is false the tenant has no reachable analytics deployment — that is an absence of tracking, NOT proof upsells perform at zero.',
        input: z.object({
            tenantId: UUID,
            days: z
                .number()
                .int()
                .min(1)
                .max(365)
                .optional()
                .describe('Trailing window in days (default 30, max 365)'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; days?: number }
            return fetchUpsellPerformanceForTenantId(i.tenantId, ctx, i.days ?? 30)
        },
    }),
    op({
        name: 'get_tenant',
        description: 'Fetch a single tenant by slug. Envelope: { slug }.',
        input: z.object({ slug: z.string().min(1) }),
        execute: async (ctx, input) => {
            const { data, error } = await getTenantBySlugSupabase((input as { slug: string }).slug)
            if (error) throw error
            return data
        },
    }),
    // ---------------------------------------------------------------------
    // Owner account (superadmin-only; excluded from the merchant surface)
    // ---------------------------------------------------------------------
    op({
        name: 'create_tenant_owner',
        description:
            "Create the OWNER login for a tenant: an auth user plus the app_users owner row (full access, can manage staff). A store has exactly one owner; this fails if one exists. Envelope: { tenantId, email, password?, displayName? }. When password is omitted one is generated. THE PASSWORD IS RETURNED ONCE AND NEVER STORED — hand it to the merchant together with loginUrl. Use list_tenant_users first to check for an existing owner.",
        input: z.object({
            tenantId: UUID,
            email: z.string().email().describe("The owner's login email"),
            password: z.string().min(8).optional().describe('Optional; min 8 chars. Omit to have one generated.'),
            displayName: z.string().min(1).max(100).optional().describe('Name shown in the merchant app'),
        }),
        execute: (ctx, input) => createTenantOwnerWithClient(ctx.client, input as never),
    }),
    op({
        name: 'list_tenant_users',
        description: 'List the admin/staff accounts of a tenant (email, owner flag, branch, permissions). Envelope: { tenantId }.',
        readOnly: true,
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listTenantUsersWithClient(ctx.client, (input as { tenantId: string }).tenantId),
    }),

    // ---------------------------------------------------------------------
    // Bundles & upsells — editing existing rows
    // ---------------------------------------------------------------------
    op({
        name: 'update_bundle',
        description:
            'Update an EXISTING bundle. Partial: only the fields you pass change. Envelope: { tenantId, bundleId, name?, description?, pricing_type?, fixed_price?, discount_percent?, is_active?, show_on_menu?, show_as_upsell?, display_order?, slots? }. If `slots` is present it REPLACES every slot (send the full set, from list_bundles); omit it to leave slots untouched. For the image use set_bundle_image.',
        input: z.object({
            tenantId: UUID,
            bundleId: UUID.describe('Resolve via list_bundles'),
            name: z.string().min(2).optional(),
            description: z.string().nullable().optional(),
            pricing_type: z.enum(['fixed', 'discount']).optional(),
            fixed_price: z.number().min(0).nullable().optional().describe('Used when pricing_type is fixed'),
            discount_percent: z.number().min(1).max(100).nullable().optional().describe('Used when pricing_type is discount'),
            is_active: z.boolean().optional(),
            show_on_menu: z.boolean().optional(),
            show_as_upsell: z.boolean().optional(),
            display_order: z.number().int().min(0).optional(),
            slots: z.array(z.unknown()).optional().describe('Full replacement slot set: [{ name, category_id, pick_count, sort_order, included_item_ids?, price_overrides? }]'),
        }),
        execute: async (ctx, input) => {
            const record = input as Record<string, unknown>
            const { tenantId, bundleId } = record as { tenantId: string; bundleId: string }
            const fields = { ...record }
            delete fields.tenantId
            delete fields.bundleId
            const flagsPromise = readTenantFeatureFlags(tenantId, ctx)
            if (fields.slots !== undefined) {
                const current = (await listBundlesForProvisioning(tenantId, ctx) as Array<Record<string, unknown>>).find((b) => b.id === bundleId)
                if (!current) throw new Error('Bundle not found')
                const merged: Record<string, unknown> = { ...current, ...fields, image_url: (fields.image_url ?? current.image_url ?? '') as string }
                delete merged.id
                const bundle = await updateBundle(bundleId, tenantId, merged as never, ctx)
                return withFeatureWarning(bundle, 'bundles', await flagsPromise)
            }
            const bundle = await updateBundleFields(bundleId, tenantId, fields as never, ctx)
            return withFeatureWarning(bundle, 'bundles', await flagsPromise)
        },
    }),
    op({
        name: 'set_bundle_image',
        description:
            "Host an image on the platform CDN and set it as a bundle's picture. Envelope: { tenantId, bundleId, imageBase64? | sourceUrl?, fileName? } — exactly one of imageBase64 (bytes you generated) or sourceUrl (a public link / Drive share link).",
        input: z.object({
            tenantId: UUID,
            bundleId: UUID.describe('Resolve via list_bundles'),
            imageBase64: z.string().min(1).optional().describe('Image bytes as base64 (raw or data: URI)'),
            sourceUrl: z.string().url().optional().describe('Public image link (direct URL or Drive/Dropbox share link)'),
            fileName: z.string().min(1).optional().describe('e.g. "meal-deal.png"'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; bundleId: string } & ImageSource
            const source = pickImageSource(i)
            assertSingleImageSource(source)
            return setBundleImage(i.bundleId, i.tenantId, source, ctx)
        },
    }),
    op({
        name: 'update_upsell_pair',
        description:
            'Update an EXISTING upsell pair. Partial: only the fields you pass change. Envelope: { tenantId, pairId, pair_type?, is_active?, display_order?, source_item_id?, target_item_id?, source_label?, target_label?, upgrade_header?, upgrade_display_style?, max_suggestions? }. Resolve pairId via list_upsell_pairs. Pass null for a label to clear it.',
        input: z.object({
            tenantId: UUID,
            pairId: UUID,
            pair_type: z.enum(['complementary', 'upgrade']).optional(),
            is_active: z.boolean().optional(),
            display_order: z.number().int().min(0).optional(),
            source_item_id: UUID.optional(),
            target_item_id: UUID.optional(),
            source_label: z.string().max(50).nullable().optional().describe('Upgrade pairs: label for the current item, e.g. "Ala Carte"'),
            target_label: z.string().max(50).nullable().optional().describe('Upgrade pairs: label for the upgrade, e.g. "Meal"'),
            upgrade_header: z.string().max(100).nullable().optional().describe('Upgrade pairs: section header, e.g. "Make it a Meal?"'),
            upgrade_display_style: z.enum(['inline', 'modal']).optional(),
            max_suggestions: z.number().int().min(1).max(8).optional(),
        }),
        execute: async (ctx, input) => {
            const record = input as Record<string, unknown>
            const { tenantId, pairId } = record as { tenantId: string; pairId: string }
            const fields = { ...record }
            delete fields.tenantId
            delete fields.pairId
            const [pair, flags] = await Promise.all([
                updateUpsellPair(pairId, tenantId, fields as never, ctx),
                readTenantFeatureFlags(tenantId, ctx),
            ])
            return withFeatureWarning(pair, 'upsells', flags)
        },
    }),

    // ---------------------------------------------------------------------
    // Branding images, banners, design read-back
    // ---------------------------------------------------------------------
    op({
        name: 'get_branding',
        description:
            "Read a tenant's current branding/design values (every field update_branding can write) plus `options`: the allowed values for each select field (hero_preset, card_template, page_layout, header_template, font_pair, storefront_palette, footer_theme, …). Call this before designing so you never guess a template name. Envelope: { tenantId }.",
        readOnly: true,
        input: z.object({ tenantId: UUID }),
        execute: async (ctx, input) => {
            const { tenantId } = input as { tenantId: string }
            const fieldIds = listBrandingFieldIds()
            const snapshot = await readBrandingSnapshot(ctx, tenantId, fieldIds)
            return {
                tenantId,
                tenantSlug: snapshot.slug,
                values: snapshot.values,
                options: describeBrandingOptions(),
                imageTargets: ['hero', 'logo', 'footer_logo', 'background', 'flash_screen'],
                notes: [
                    'Use set_branding_image for hero/logo/background/flash images and add_banner for promo banners; both host the image on the platform CDN.',
                    'hero_image_url only renders on the split, collage, minimal or centered hero presets and never while hero_featured_product_id is set.',
                ],
            }
        },
    }),
    op({
        name: 'set_branding_image',
        description:
            "Host an image on the platform CDN and attach it to a storefront surface. target: hero (storefront hero image), logo, footer_logo, background (page background), flash_screen. Envelope: { tenantId, target, imageBase64? | sourceUrl?, fileName? } — exactly one of imageBase64 (bytes you generated) or sourceUrl (a public link). Returns the hosted url and a warning when the current hero preset would not show the image.",
        input: z.object({
            tenantId: UUID,
            target: z.enum(['hero', 'logo', 'footer_logo', 'background', 'flash_screen']),
            imageBase64: z.string().min(1).optional().describe('Image bytes as base64 (raw or data: URI)'),
            sourceUrl: z.string().url().optional().describe('Public image link (direct URL or Drive/Dropbox share link)'),
            fileName: z.string().min(1).optional().describe('e.g. "hero-summer.jpg"'),
        }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; target: 'hero' | 'logo' | 'footer_logo' | 'background' | 'flash_screen' } & ImageSource
            const source = pickImageSource(i)
            assertSingleImageSource(source)
            return setTenantImage(ctx, { tenantId: i.tenantId, target: i.target, source })
        },
    }),
    op({
        name: 'add_banner',
        description:
            "Add a promotional banner image to the website. For 'make me a banner and put it on the site': generate the image, then call this with the bytes (imageBase64) or a public link (sourceUrl). surface: 'menu' (promotion deck at the top of the menu page — landscape ~16:9 works best; the deck is switched on automatically) or 'welcome' (multi-branch welcome page; pass format landscape|portrait|square). Existing banners are kept. Envelope: { tenantId, surface, imageBase64? | sourceUrl?, fileName?, title?, description?, format?, visible? }.",
        input: z.object({
            tenantId: UUID,
            surface: z.enum(['menu', 'welcome']),
            imageBase64: z.string().min(1).optional().describe('Image bytes as base64 (raw or data: URI)'),
            sourceUrl: z.string().url().optional().describe('Public image link (direct URL or Drive/Dropbox share link)'),
            fileName: z.string().min(1).optional().describe('e.g. "summer-promo.png"'),
            title: z.string().max(200).optional(),
            description: z.string().max(500).optional(),
            format: z.enum(['landscape', 'portrait', 'square']).optional().describe('Welcome surface only; defaults to landscape'),
            visible: z.boolean().optional().describe('Menu surface only: false adds the banner without turning the deck on'),
        }),
        execute: (ctx, input) => {
            const i = input as {
                tenantId: string; surface: 'menu' | 'welcome'; title?: string; description?: string
                format?: 'landscape' | 'portrait' | 'square'; visible?: boolean
            } & ImageSource
            const source = pickImageSource(i)
            assertSingleImageSource(source)
            return addTenantBanner(ctx, {
                tenantId: i.tenantId, surface: i.surface, source,
                title: i.title, description: i.description, format: i.format, visible: i.visible,
            })
        },
    }),
    op({
        name: 'update_banner',
        description:
            'Edit one existing banner (title/description/format, or replace its image with imageBase64 / sourceUrl). Pass null for title/description to clear. Envelope: { tenantId, surface, bannerId, title?, description?, format?, imageBase64?, sourceUrl?, fileName? }. Resolve bannerId via list_banners.',
        input: z.object({
            tenantId: UUID,
            surface: z.enum(['menu', 'welcome']),
            bannerId: z.string().min(1),
            title: z.string().max(200).nullable().optional(),
            description: z.string().max(500).nullable().optional(),
            format: z.enum(['landscape', 'portrait', 'square']).optional(),
            imageBase64: z.string().min(1).optional(),
            sourceUrl: z.string().url().optional(),
            fileName: z.string().min(1).optional(),
        }),
        execute: (ctx, input) => {
            const i = input as {
                tenantId: string; surface: 'menu' | 'welcome'; bannerId: string
                title?: string | null; description?: string | null; format?: 'landscape' | 'portrait' | 'square'
            } & ImageSource
            const source = pickImageSource(i)
            if (source.imageBase64 || source.sourceUrl) assertSingleImageSource(source)
            return updateTenantBanner(ctx, {
                tenantId: i.tenantId, surface: i.surface, bannerId: i.bannerId,
                title: i.title, description: i.description, format: i.format,
                ...(source.imageBase64 || source.sourceUrl ? { source } : {}),
            })
        },
    }),
    op({
        name: 'clear_banner',
        description: 'Take one banner off a surface (the hosted image is kept). Envelope: { tenantId, surface, bannerId }. Resolve bannerId via list_banners.',
        input: z.object({ tenantId: UUID, surface: z.enum(['menu', 'welcome']), bannerId: z.string().min(1) }),
        execute: (ctx, input) => clearTenantBanner(ctx, input as { tenantId: string; surface: 'menu' | 'welcome'; bannerId: string }),
    }),
    op({
        name: 'list_banners',
        description: "List a tenant's menu promotion banners (with whether the deck is visible) and welcome-page banners, with ids. Envelope: { tenantId }.",
        readOnly: true,
        input: z.object({ tenantId: UUID }),
        execute: (ctx, input) => listTenantBanners(ctx, (input as { tenantId: string }).tenantId),
    }),

    // ---------------------------------------------------------------------
    // Category icons
    // ---------------------------------------------------------------------
    op({
        name: 'list_category_icons',
        description:
            'The curated icon catalog for menu categories, grouped (Popular, Proteins & Mains, Desserts, Drinks, …). Store an icon as "lucide:<name>" (e.g. "lucide:pizza") via add_category, update_category or set_category_icons. No input.',
        readOnly: true,
        input: z.object({}).passthrough(),
        execute: async () => ({
            convention: `${LUCIDE_PREFIX}<name>`,
            groups: CURATED_ICON_GROUPS.map((group) => ({ label: group.label, icons: group.icons })),
            example: { icon: `${LUCIDE_PREFIX}pizza`, icon_color: '#E63946' },
        }),
    }),
    op({
        name: 'update_category',
        description:
            'Update an EXISTING category. Partial: only the fields you pass change. Envelope: { tenantId, categoryId, name?, description?, icon?, icon_color?, is_active?, display_layout?, card_template? }. icon is "lucide:<name>" from list_category_icons (or one emoji); pass "" to clear. Resolve categoryId via list_categories.',
        input: z.object({
            tenantId: UUID,
            categoryId: UUID,
            name: z.string().min(2).optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            icon_color: z.string().optional(),
            is_active: z.boolean().optional(),
            display_layout: z.enum(['grid', 'horizontal_scroll', 'horizontal_mobile_only', 'horizontal_desktop_only']).optional(),
            card_template: z.string().nullable().optional(),
        }),
        execute: (ctx, input) => {
            const record = input as Record<string, unknown>
            const { tenantId, categoryId } = record as { tenantId: string; categoryId: string }
            const fields = { ...record }
            delete fields.tenantId
            delete fields.categoryId
            return updateCategoryFields(categoryId, tenantId, fields as never, ctx)
        },
    }),
    op({
        name: 'set_category_icons',
        description:
            'Assign icons to many categories at once ("give every category a proper icon"). Every icon is validated against the catalog BEFORE any write, so one typo fails the whole call with nothing changed. Envelope: { tenantId, assignments: [{ categoryId, icon, icon_color? }] }. Use list_categories + list_category_icons first.',
        input: z.object({
            tenantId: UUID,
            assignments: z.array(z.object({
                categoryId: UUID,
                icon: z.string().describe('"lucide:<name>" from list_category_icons, or one emoji'),
                icon_color: z.string().optional().describe('6-digit hex, e.g. #FF6B00'),
            })).min(1),
        }),
        execute: async (ctx, input) => {
            const { tenantId, assignments } = input as {
                tenantId: string; assignments: Array<{ categoryId: string; icon: string; icon_color?: string }>
            }
            const invalid = assignments.filter((a) => !isKnownCategoryIcon(a.icon) || !isValidCategoryIconColor(a.icon_color))
            if (invalid.length > 0) {
                throw new Error(
                    `Unknown icon or bad color for ${invalid.map((a) => `${a.categoryId} (${a.icon}${a.icon_color ? ` ${a.icon_color}` : ''})`).join(', ')}. Use list_category_icons for valid names; colors are 6-digit hex.`,
                )
            }
            const updated: Array<{ categoryId: string; icon: string; icon_color?: string }> = []
            for (const a of assignments) {
                const patch: Record<string, unknown> = { icon: a.icon }
                if (a.icon_color !== undefined) patch.icon_color = a.icon_color
                await updateCategoryFields(a.categoryId, tenantId, patch as never, ctx)
                updated.push(a)
            }
            return { updated: updated.length, assignments: updated }
        },
    }),
]

// Fail-closed at import: a destructive-named op must never make it into the
// registry. If one is ever added, the module throws on load rather than quietly
// exposing a delete tool to the superadmin-authenticated MCP.
for (const o of ops) {
    assertNonDestructiveOpName(o.name)
}

export const PROVISIONING_OPS: Record<string, ProvisioningOp<unknown>> = Object.fromEntries(
    ops.map((o) => [o.name, o]),
)

export function listOps(): ProvisioningOp<unknown>[] {
    return ops
}

/**
 * Validate a raw payload against the named op's envelope schema and execute it
 * against the injected service-role context. Throws on an unknown op or a
 * schema violation (deep field errors surface from the service writer).
 */
export async function executeOp(name: string, ctx: ProvisioningCtx, rawInput: unknown): Promise<unknown> {
    // Runtime fail-closed: reject any destructive op name before it can reach a
    // registry lookup or a service writer, even if one were somehow registered.
    assertNonDestructiveOpName(name)
    const found = PROVISIONING_OPS[name]
    if (!found) {
        throw new Error(`Unknown op: ${name}`)
    }
    const parsed = found.input.parse(rawInput ?? {})
    return found.execute(ctx, parsed)
}
