import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestCaller } from '@/lib/auth/request-caller'
import {
  reviewHref,
  reviewMessage,
  shouldOfferStaffReview,
  staffNeedingReview,
  type StaffReviewRow,
} from '@/lib/staff/staff-access-review'
import { ReviewStaffAccessCard } from './review-staff-access-card'

interface ReviewStaffAccessNudgeProps {
  tenant: { id: string; slug: string }
}

/**
 * On the dashboard, for the owner only, while any staff account is still on
 * legacy full access. Renders nothing for anyone else and never fails the page.
 *
 * The service role reads the roster because the caller has already been
 * checked as this store's owner (or the superadmin) and the tenant comes from
 * the route's own tenant row, never from the request.
 */
export async function ReviewStaffAccessNudge({ tenant }: ReviewStaffAccessNudgeProps) {
  try {
    const { appUser } = await getRequestCaller()
    if (!shouldOfferStaffReview(appUser, tenant.id)) return null

    const { data, error } = await createAdminClient()
      .from('app_users')
      .select('user_id, role, is_owner, permissions, display_name, email')
      .eq('tenant_id', tenant.id)
      .eq('role', 'admin')
      .is('permissions', null)
    if (error) throw new Error(error.message)

    const people = staffNeedingReview((data ?? []) as StaffReviewRow[])
    if (people.length === 0) return null

    const { title, detail } = reviewMessage(people)
    return (
      <ReviewStaffAccessCard
        tenantId={tenant.id}
        href={reviewHref(tenant.slug, people)}
        title={title}
        detail={detail}
      />
    )
  } catch (error) {
    console.error('[staff] access review nudge failed', error instanceof Error ? error.message : error)
    return null
  }
}
