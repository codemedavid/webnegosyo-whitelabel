'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { heroDesignSchema } from '@/lib/hero-designer-schemas'
import { heroBlockDesignSchema } from '@/lib/hero-block-schemas'
import { z } from 'zod'
import type { HeroDesign } from '@/types/hero-designer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveHeroDesignResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Save a hero design for a tenant. Pass `null` to clear/reset to default.
 */
export async function saveHeroDesignAction(
  tenantId: string,
  tenantSlug: string,
  design: HeroDesign | null
): Promise<SaveHeroDesignResult> {
  try {
    const supabase = await createClient()

    // Verify caller is admin of this tenant (or superadmin)
    await verifyTenantAdmin(tenantId)

    // Validate input (null means "reset to default")
    if (design && typeof design === 'object' && 'version' in design && (design as { version: number }).version === 4) {
      const blockResult = heroBlockDesignSchema.safeParse(design)
      if (!blockResult.success) {
        return { success: false, error: `Validation failed: ${blockResult.error.issues[0]?.message}` }
      }
      // Skip v3 validation, proceed to save
    } else if (design !== null) {
      heroDesignSchema.parse(design)
    }

    // Update database
    const { error } = await supabase
      .from('tenants')
      .update({ hero_design: design as unknown as Record<string, unknown> })
      .eq('id', tenantId)
      .select('id')
      .single()

    if (error) {
      console.error('[saveHeroDesignAction] Database error:', error)
      return { success: false, error: error.message }
    }

    // Revalidate cached pages for instant updates
    revalidatePath(`/${tenantSlug}/menu`, 'layout')

    console.log(`[saveHeroDesignAction] Hero design saved and cache revalidated for ${tenantSlug}`)

    return { success: true }
  } catch (error) {
    console.error('[saveHeroDesignAction] Error:', error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Toggle hero section visibility for a tenant.
 */
export async function updateHeroSectionEnabledAction(
  tenantId: string,
  tenantSlug: string,
  enabled: boolean
): Promise<SaveHeroDesignResult> {
  try {
    const supabase = await createClient()

    await verifyTenantAdmin(tenantId)

    const validated = z.boolean().parse(enabled)

    const { error } = await supabase
      .from('tenants')
      .update({ hero_section_enabled: validated })
      .eq('id', tenantId)
      .select('id')
      .single()

    if (error) {
      console.error('[updateHeroSectionEnabledAction] Database error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath(`/${tenantSlug}/menu`, 'layout')

    return { success: true }
  } catch (error) {
    console.error('[updateHeroSectionEnabledAction] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/**
 * Load the hero design for a tenant.
 */
export async function getHeroDesignAction(
  tenantId: string
): Promise<{ success: boolean; design: HeroDesign | null; error?: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('tenants')
      .select('hero_design')
      .eq('id', tenantId)
      .single()

    if (error) {
      console.error('[getHeroDesignAction] Database error:', error)
      return { success: false, design: null, error: error.message }
    }

    const design = (data?.hero_design as unknown as HeroDesign) ?? null

    return { success: true, design }
  } catch (error) {
    console.error('[getHeroDesignAction] Error:', error)
    return {
      success: false,
      design: null,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
