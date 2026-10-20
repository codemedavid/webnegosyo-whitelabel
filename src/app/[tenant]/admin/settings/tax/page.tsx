import { SettingsSection } from '@/components/admin/settings/settings-section'
import { ApprovalPinCard } from '@/components/admin/tax-settings/approval-pin-card'
import { TaxSettingsForm } from '@/components/admin/tax-settings/tax-settings-form'
import {
  LastChangedLine,
  NotSetUpBanner,
  ReadOnlyNote,
  TaxLoadError,
} from '@/components/admin/tax-settings/tax-status-notices'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { formValuesFromProfile } from '@/lib/tax-settings/form-mapping'
import { describeLastChange, type TaxProfileLastChange } from '@/lib/tax-settings/last-change'
import {
  readHasApprovalPin,
  readLastTaxProfileChange,
  readStoreTaxProfile,
} from '@/lib/tax-settings/load-tax-settings'
import { canHoldApprovalPin } from '@/lib/tax-settings/pin-schema'

export const metadata = {
  title: 'Tax & discounts',
}

export default async function TaxSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant, viewer, caller } = await requireSettingsSection(tenantSlug, 'tax')
  const { user } = await getRequestCaller()
  const userId = user?.id ?? null

  // Writes are the owner's (or a superadmin's) alone — the same rule RLS applies.
  const canEdit = viewer.isOwner
  const mayHoldPin =
    userId !== null &&
    canHoldApprovalPin(
      { role: caller.role, tenantId: caller.tenant_id, hasReviewPermission: viewer.hasPermission('discount_review') },
      tenant.id
    )

  const [profileRead, ownerChange, hasPin] = await Promise.all([
    readStoreTaxProfile(tenant.id),
    // The change log is owner-readable only; everyone else sees the date alone.
    canEdit ? readLastTaxProfileChange(tenant.id) : Promise.resolve(null),
    mayHoldPin && userId ? readHasApprovalPin(tenant.id, userId) : Promise.resolve(null),
  ])

  const pinCard = mayHoldPin ? <ApprovalPinCard tenantId={tenant.id} hasPin={hasPin} /> : null

  if (profileRead.status === 'error') {
    return (
      <SettingsSection tenantSlug={tenantSlug} section="tax">
        <TaxLoadError />
        {pinCard}
      </SettingsSection>
    )
  }

  const { profile, updatedAt } = profileRead
  const lastChange: TaxProfileLastChange | null =
    ownerChange ?? (updatedAt ? { changedAt: updatedAt, changedBy: null, changerName: null } : null)
  const lastChangedText = describeLastChange(lastChange, userId)

  return (
    <SettingsSection tenantSlug={tenantSlug} section="tax">
      {(lastChangedText || !canEdit) && (
        <div className="-mt-3 space-y-3">
          {lastChangedText && <LastChangedLine text={lastChangedText} />}
          {!canEdit && <ReadOnlyNote />}
        </div>
      )}
      {!profile && <NotSetUpBanner canEdit={canEdit} />}

      <TaxSettingsForm
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        defaults={formValuesFromProfile(profile)}
        hasProfile={profile !== null}
        canEdit={canEdit}
      />

      {pinCard}
    </SettingsSection>
  )
}
