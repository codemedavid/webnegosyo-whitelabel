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
} from '@/lib/admin-service'
import { createAddonLibraryEntry, listAddonLibraryForProvisioning } from '@/lib/addon-library-service'
import { attachAddonEntriesToItems } from '@/lib/addon-bulk-attach'
import { createUpsellPair, bulkUpdateBcgClassification, listUpsellPairsForProvisioning } from '@/lib/menu-engineering-service'
import { classifyMenu } from '@/lib/menu-engineering-classify'
import { reorderCategoriesForProvisioning, reorderMenuItemsForProvisioning } from '@/lib/menu-arrangement'
import { createBundle, listBundlesForProvisioning } from '@/lib/bundles-service'
import { withFeatureWarning, type TenantFeatureFlags } from '@/lib/mcp/feature-flag-warnings'
import { createPaymentMethod } from '@/lib/payment-methods-service'
import { saveBrandingAction } from '@/app/actions/branding'
import { brandingPatchSchema, type BrandingPatchInput } from '@/lib/branding-service'
import { fetchMenuPerformanceForTenantId } from '@/lib/queries/menu-performance'
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
    const { data, error } = await ctx.client
        .from('tenants')
        .select('bundles_enabled, menu_engineering_enabled, checkout_upsell_enabled')
        .eq('id', tenantId)
        .single()

    if (error || !data) return {}
    return data as unknown as TenantFeatureFlags
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
        description: 'Add a menu category to a tenant. Envelope: { tenantId, name, order, ... }.',
        input: tenantScoped(),
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
        description: 'Add a payment method to a tenant. Envelope: { tenantId, name, details?, qrCodeUrl?, isActive?, orderTypes?, requirePaymentProof? }.',
        input: z.object({
            tenantId: UUID,
            name: z.string().min(1),
            details: z.string().optional(),
            qrCodeUrl: z.string().optional(),
            isActive: z.boolean().optional(),
            orderTypes: z.array(z.string()).optional(),
            requirePaymentProof: z.boolean().optional(),
        }),
        execute: (ctx, input) => {
            const i = input as {
                tenantId: string; name: string; details?: string; qrCodeUrl?: string
                isActive?: boolean; orderTypes?: string[]; requirePaymentProof?: boolean
            }
            return createPaymentMethod(i.tenantId, i.name, i.details, i.qrCodeUrl, i.isActive ?? true, i.orderTypes ?? [], i.requirePaymentProof ?? false, ctx)
        },
    }),
    op({
        name: 'update_branding',
        description: 'Partially update a tenant\'s branding (logo, colors, templates, hero, footer). Only include fields that should change. Envelope: { tenantId, tenantSlug, branding: {...} }.',
        input: z.object({ tenantId: UUID, tenantSlug: z.string().min(1), branding: brandingPatchSchema }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; tenantSlug: string; branding: BrandingPatchInput }
            return saveBrandingAction(i.tenantId, i.tenantSlug, i.branding, ctx)
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
        input: z.object({}).passthrough(),
        execute: async () => {
            const { data, error } = await listTenantsSupabase()
            if (error) throw error
            return data
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
        name: 'get_tenant',
        description: 'Fetch a single tenant by slug. Envelope: { slug }.',
        input: z.object({ slug: z.string().min(1) }),
        execute: async (ctx, input) => {
            const { data, error } = await getTenantBySlugSupabase((input as { slug: string }).slug)
            if (error) throw error
            return data
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
