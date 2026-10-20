/**
 * Publishing the Studio draft, one store at a time. Each store's write is
 * independent: a failure is reported by name and keeps only that store's
 * draft, while stores that saved are marked published. Only changed fields
 * are sent (studio-drafts' publish patches).
 *
 * Server actions are injected so the orchestration is testable on its own.
 */

import {
    hasCategoryDraftChanges,
    applyCategoryDraft,
    buildCategoryPublishPlan,
} from '@/lib/category-studio'
import type { OverrideMap } from '@/lib/mobile-overrides'
import type { CategoryInput } from '@/lib/admin-service'
import type { Category } from '@/types/database'
import {
    productPublishPatch,
    tenantPublishPatch,
    type SavedStores,
    type StudioDrafts,
} from '@/lib/branding-studio/studio-drafts'

interface ActionResult {
    success: boolean
    error?: string
    warning?: string
}

export interface PublishActions {
    saveTenant: (patch: Record<string, unknown>) => Promise<ActionResult>
    saveProduct: (patch: Record<string, unknown>) => Promise<ActionResult>
    reorderCategories: (orderedIds: string[]) => Promise<ActionResult>
    updateCategory: (categoryId: string, input: CategoryInput) => Promise<ActionResult>
}

export interface PublishInput {
    drafts: StudioDrafts
    saved: SavedStores
    categories: Category[]
}

export interface PublishFailure {
    /** The part of the Studio that didn't save, in the owner's words. */
    part: string
    error: string
}

export interface PublishResult {
    published: { tenant: boolean; product: boolean }
    /** The arrangement now saved, when the menu layout published. */
    publishedCategories: Category[] | null
    nextMobile: OverrideMap | null
    nextMobileProduct: OverrideMap | null
    failures: PublishFailure[]
    warnings: string[]
}

const TENANT_PART = 'Store colours & layout'
const PRODUCT_PART = 'Item page'
const CATEGORIES_PART = 'Menu layout'

async function attempt(write: () => Promise<ActionResult>): Promise<ActionResult> {
    try {
        return await write()
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Something went wrong' }
    }
}

async function publishCategories(actions: PublishActions, input: PublishInput): Promise<ActionResult> {
    const plan = buildCategoryPublishPlan(input.categories, input.drafts.categories)
    if (plan.orderedIds) {
        const result = await attempt(() => actions.reorderCategories(plan.orderedIds as string[]))
        if (!result.success) return result
    }
    for (const update of plan.updates) {
        const result = await attempt(() => actions.updateCategory(update.id, update.input))
        if (!result.success) return result
    }
    return { success: true }
}

export async function publishStudio(actions: PublishActions, input: PublishInput): Promise<PublishResult> {
    const tenantPatch = tenantPublishPatch(input.drafts, input.saved)
    const productPatch = productPublishPatch(input.drafts, input.saved)
    const failures: PublishFailure[] = []
    const warnings: string[] = []

    let tenantSaved = false
    if (tenantPatch) {
        const result = await attempt(() => actions.saveTenant(tenantPatch))
        tenantSaved = result.success
        if (!result.success) failures.push({ part: TENANT_PART, error: result.error || 'Could not save' })
        if (result.warning) warnings.push(result.warning)
    }

    let productSaved = false
    if (productPatch) {
        const result = await attempt(() => actions.saveProduct(productPatch))
        productSaved = result.success
        if (!result.success) failures.push({ part: PRODUCT_PART, error: result.error || 'Could not save' })
    }

    let publishedCategories: Category[] | null = null
    if (hasCategoryDraftChanges(input.drafts.categories)) {
        const result = await publishCategories(actions, input)
        if (result.success) publishedCategories = applyCategoryDraft(input.categories, input.drafts.categories)
        else failures.push({ part: CATEGORIES_PART, error: result.error || 'Could not save' })
    }

    return {
        published: { tenant: tenantSaved, product: productSaved },
        publishedCategories,
        nextMobile: tenantSaved ? ((tenantPatch?.mobile_overrides as OverrideMap | undefined) ?? null) : null,
        nextMobileProduct: productSaved ? ((productPatch?.mobile_overrides as OverrideMap | undefined) ?? null) : null,
        failures,
        warnings,
    }
}
