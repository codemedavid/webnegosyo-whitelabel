'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { LIMITS } from '@/lib/hero-builder/constants'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

interface PublishHeroResult {
  success: boolean
  error?: string
}

/**
 * Publish a Hero Builder (v5) design: validate it, store it, and switch the
 * storefront's hero style to 'custom' so the published design is what diners
 * see. `hero_design` is a TEXT column, so the design is stored as JSON text.
 */
export async function publishHeroDesignAction(
  tenantId: string,
  tenantSlug: string,
  design: unknown,
): Promise<PublishHeroResult> {
  try {
    await verifyTenantPermission(tenantId, 'store_setup')

    const parsed = heroDesignV5Schema.safeParse(design)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path?.length ? ` (${issue.path.join('.')})` : ''
      return { success: false, error: `${issue?.message ?? 'Invalid design'}${where}` }
    }
    if (parsed.data.sections.length === 0) {
      return { success: false, error: 'Add at least one section before publishing.' }
    }

    const serialized = JSON.stringify(parsed.data)
    if (serialized.length > LIMITS.designBytes) {
      return { success: false, error: 'This design is too large. Remove some elements or shorten custom code.' }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('tenants')
      .update({ hero_design: serialized, hero_preset: 'custom', hero_section_enabled: true })
      .eq('id', tenantId)
      .select('id')
      .single()

    if (error) {
      console.error('[publishHeroDesignAction] Database error:', error)
      return { success: false, error: 'Could not publish the hero. Please try again.' }
    }

    revalidateStorefrontMenu(tenantSlug)
    return { success: true }
  } catch (error) {
    console.error('[publishHeroDesignAction] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Take the custom hero off the storefront (the design is kept, so it can be
 * published again). The storefront falls back to the theme hero.
 */
export async function unpublishHeroDesignAction(tenantId: string, tenantSlug: string): Promise<PublishHeroResult> {
  try {
    await verifyTenantPermission(tenantId, 'store_setup')
    const supabase = await createClient()
    const { error } = await supabase
      .from('tenants')
      .update({ hero_preset: 'theme' })
      .eq('id', tenantId)
      .select('id')
      .single()
    if (error) {
      console.error('[unpublishHeroDesignAction] Database error:', error)
      return { success: false, error: 'Could not update the storefront. Please try again.' }
    }
    revalidateStorefrontMenu(tenantSlug)
    return { success: true }
  } catch (error) {
    console.error('[unpublishHeroDesignAction] Error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }
  }
}
