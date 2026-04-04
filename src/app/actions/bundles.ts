'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
    getBundlesByTenant,
    getBundleById,
    createBundle,
    updateBundle,
    deleteBundle,
    toggleBundleActive,
    reorderBundles,
    getMenuBundles,
    getUpsellBundles,
    invalidateBundlesCache,
    type BundleInput,
    type BundleWithSlots,
} from '@/lib/bundles-service'

export async function getBundlesAction(tenantId: string): Promise<{ success: true; data: BundleWithSlots[] } | { success: false; error: string }> {
    try {
        const bundles = await getBundlesByTenant(tenantId)
        return { success: true, data: bundles }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch bundles' }
    }
}

export async function getBundleAction(bundleId: string, tenantId: string): Promise<{ success: true; data: BundleWithSlots } | { success: false; error: string }> {
    try {
        const bundle = await getBundleById(bundleId, tenantId)
        return { success: true, data: bundle }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch bundle' }
    }
}

export async function createBundleAction(tenantId: string, tenantSlug: string, input: BundleInput): Promise<{ success: true; data: BundleWithSlots } | { success: false; error: string }> {
    try {
        const bundle = await createBundle(tenantId, input)
        await invalidateBundlesCache(tenantId)
        revalidatePath(`/${tenantSlug}/admin/bundles`)
        revalidatePath(`/${tenantSlug}/menu`)
        return { success: true, data: bundle }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: JSON.stringify(error.issues.map(err => ({
                    path: err.path,
                    message: err.message,
                }))),
            }
        }
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create bundle' }
    }
}

export async function updateBundleAction(
    bundleId: string,
    tenantId: string,
    tenantSlug: string,
    input: BundleInput
): Promise<{ success: true; data: BundleWithSlots } | { success: false; error: string }> {
    try {
        const bundle = await updateBundle(bundleId, tenantId, input)
        await invalidateBundlesCache(tenantId)
        revalidatePath(`/${tenantSlug}/admin/bundles`)
        revalidatePath(`/${tenantSlug}/admin/bundles/${bundleId}`)
        revalidatePath(`/${tenantSlug}/menu`)
        return { success: true, data: bundle }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: JSON.stringify(error.issues.map(err => ({
                    path: err.path,
                    message: err.message,
                }))),
            }
        }
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update bundle' }
    }
}

export async function deleteBundleAction(bundleId: string, tenantId: string, tenantSlug: string) {
    try {
        await deleteBundle(bundleId, tenantId)
        await invalidateBundlesCache(tenantId)
        revalidatePath(`/${tenantSlug}/admin/bundles`)
        revalidatePath(`/${tenantSlug}/menu`)
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete bundle' }
    }
}

export async function toggleBundleActiveAction(
    bundleId: string,
    tenantId: string,
    tenantSlug: string,
    isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await toggleBundleActive(bundleId, tenantId, isActive)
        await invalidateBundlesCache(tenantId)
        revalidatePath(`/${tenantSlug}/admin/bundles`)
        revalidatePath(`/${tenantSlug}/menu`)
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle bundle' }
    }
}

export async function reorderBundlesAction(tenantId: string, tenantSlug: string, bundleIds: string[]) {
    try {
        await reorderBundles(tenantId, bundleIds)
        await invalidateBundlesCache(tenantId)
        revalidatePath(`/${tenantSlug}/admin/bundles`)
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to reorder bundles' }
    }
}

export async function getMenuBundlesAction(tenantId: string): Promise<{ success: true; data: BundleWithSlots[] } | { success: false; error: string }> {
    try {
        const bundles = await getMenuBundles(tenantId)
        return { success: true, data: bundles }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch menu bundles' }
    }
}

export async function getUpsellBundlesAction(tenantId: string): Promise<{ success: true; data: BundleWithSlots[] } | { success: false; error: string }> {
    try {
        const bundles = await getUpsellBundles(tenantId)
        return { success: true, data: bundles }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch upsell bundles' }
    }
}
