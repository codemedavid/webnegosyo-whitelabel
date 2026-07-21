import { z } from 'zod'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { createTenantSupabase, updateTenantSupabase, listTenantsSupabase, getTenantBySlugSupabase } from '@/lib/tenants-service'
import { createCategory, createMenuItem, updateMenuItemImage, listMenuItemsForProvisioning } from '@/lib/admin-service'
import { createAddonLibraryEntry } from '@/lib/addon-library-service'
import { createUpsellPair } from '@/lib/menu-engineering-service'
import { createBundle } from '@/lib/bundles-service'
import { createPaymentMethod } from '@/lib/payment-methods-service'
import { saveBrandingAction } from '@/app/actions/branding'
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

/** Passthrough record for payloads whose deep shape a service validates. */
const looseRecord = z.record(z.string(), z.unknown())

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
        name: 'add_addon_library_entry',
        description: 'Create a reusable addon-library entry (shared addon group) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: (ctx, input) => createAddonLibraryEntry((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
    }),
    op({
        name: 'create_upsell_pair',
        description: 'Create an upsell pair (complementary or upgrade) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: (ctx, input) => createUpsellPair((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
    }),
    op({
        name: 'create_bundle',
        description: 'Create a menu bundle (fixed or discount pricing) for a tenant. Envelope: { tenantId, ... }.',
        input: tenantScoped(),
        execute: (ctx, input) => createBundle((input as { tenantId: string }).tenantId, withoutTenantId(input as Record<string, unknown>) as never, ctx),
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
        description: 'Update a tenant\'s branding (colors, templates, hero, footer). Envelope: { tenantId, tenantSlug, branding: {...} }.',
        input: z.object({ tenantId: UUID, tenantSlug: z.string().min(1), branding: looseRecord }),
        execute: (ctx, input) => {
            const i = input as { tenantId: string; tenantSlug: string; branding: Record<string, unknown> }
            return saveBrandingAction(i.tenantId, i.tenantSlug, i.branding as never, ctx)
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
    // Reads
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
