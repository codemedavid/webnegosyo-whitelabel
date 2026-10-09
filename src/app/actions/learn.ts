'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { getPublishedLesson } from '@/lib/university/public-reads'

export type LearnResult = { success: true } | { success: false; error: string }

const SLUG = /^[a-z0-9-]{1,120}$/

/**
 * Mark a University lesson watched (or not) for the signed-in person, from
 * the store's Learn page. Only a PUBLISHED lesson can be marked; the row is
 * always the caller's own.
 */
export async function setLessonWatchedAction(
  tenantId: string,
  tenantSlug: string,
  courseSlug: string,
  lessonSlug: string,
  isWatched: boolean,
): Promise<LearnResult> {
  if (!SLUG.test(courseSlug) || !SLUG.test(lessonSlug)) return { success: false, error: 'Unknown lesson.' }
  try {
    await verifyTenantAdmin(tenantId, 'view')
    const { user } = await getRequestCaller()
    if (!user) return { success: false, error: 'Please sign in again.' }
    const found = await getPublishedLesson(courseSlug, lessonSlug)
    if (!found) return { success: false, error: 'This lesson is not available.' }

    // The generated types predate this table.
    const progress = (createAdminClient() as unknown as SupabaseClient).from('university_lesson_progress')
    const { error } = isWatched
      ? await progress.upsert({ user_id: user.id, lesson_id: found.lesson.id, tenant_id: tenantId }, { onConflict: 'user_id,lesson_id' })
      : await progress.delete().eq('user_id', user.id).eq('lesson_id', found.lesson.id)
    if (error) throw new Error(error.message)

    revalidatePath(`/${tenantSlug}/admin/learn`)
    revalidatePath(`/${tenantSlug}/admin/start`)
    return { success: true }
  } catch (error) {
    console.error('[learn] progress not saved', { tenantId, lessonSlug, error: error instanceof Error ? error.message : error })
    const message = error instanceof Error && error.message.startsWith('Unauthorized') ? 'You do not have access to this store.' : 'That did not save. Please try again.'
    return { success: false, error: message }
  }
}
