/**
 * The synchronous half of a wizard submit: create the store (in pre-launch),
 * its owner login with the password the buyer just typed, and link both to
 * the checkout lead. Runs inside the submit request so the password is used
 * once and never stored. The slow build (menu reading, offers, loyalty) runs
 * afterwards — see `build.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createTenantSupabase, isSlugTaken } from '@/lib/tenants-service'
import { createTenantOwnerWithClient } from '@/lib/tenant-owner-provisioning'
import { STORE_TYPES } from './store-type'
import { slugCandidates } from './plan'
import {
  attachOnboardingTenant,
  claimOnboardingSubmit,
  releaseOnboardingSubmit,
  type StoreOnboarding,
} from './repository'
import type { OnboardingAnswers } from './answers'
import { buyerFacingError, isBuyerFacingError } from './errors'

type AdminClient = SupabaseClient<Database>

const GENERIC_FAILURE = 'Your store could not be created. Please try again in a minute.'

export interface ProvisionedStore {
  tenantId: string
  slug: string
}

interface LeadContact {
  email: string
  name: string
}

async function readLeadContact(admin: AdminClient, leadId: string): Promise<LeadContact> {
  const { data, error } = await admin.from('checkout_leads').select('email, name').eq('id', leadId).single()
  if (error || !data) throw buyerFacingError('The order for this set-up could not be found.')
  return data as LeadContact
}

async function pickFreeSlug(admin: AdminClient, storeName: string): Promise<string> {
  const ctx = { client: admin }
  for (const candidate of slugCandidates(storeName)) {
    if (!(await isSlugTaken(candidate, undefined, ctx))) return candidate
  }
  throw new Error('Could not find a free web address for this store name. Try a slightly different name.')
}

async function createPrelaunchTenant(
  admin: AdminClient,
  answers: OnboardingAnswers,
  logoUrl: string | null,
): Promise<ProvisionedStore> {
  const slug = await pickFreeSlug(admin, answers.storeName)
  const color = STORE_TYPES[answers.storeType].defaultColor
  const tenant = await createTenantSupabase(
    {
      name: answers.storeName,
      slug,
      primary_color: color,
      secondary_color: color,
      logo_url: logoUrl ?? '',
      order_backend: 'platform',
    } as Parameters<typeof createTenantSupabase>[0],
    { client: admin },
  )

  // Pre-launch before anyone could learn the address: the store refuses
  // orders until the platform confirms the payment.
  const { error } = await admin.from('tenants').update({ is_prelaunch: true } as never).eq('id', tenant.id)
  if (error) {
    await removeTenant(admin, tenant.id)
    throw buyerFacingError('The new store could not be put in pre-launch, so it was removed. Please try again.')
  }
  return { tenantId: tenant.id, slug }
}

function describeOwnerError(message: string): string {
  return /already|registered|exists/i.test(message)
    ? 'This email already has a WebNegosyo login. Contact support and we will attach this store to it.'
    : 'Your login could not be created. Please try again.'
}

async function removeTenant(admin: AdminClient, tenantId: string): Promise<void> {
  const { error } = await admin.from('tenants').delete().eq('id', tenantId)
  if (error) console.error('[onboarding] half-built store could not be removed', { tenantId, error: error.message })
}

async function createStoreWithOwner(
  admin: AdminClient,
  onboarding: StoreOnboarding,
  answers: OnboardingAnswers,
  ownerPassword: string,
): Promise<ProvisionedStore> {
  const lead = await readLeadContact(admin, onboarding.checkoutLeadId)
  const store = await createPrelaunchTenant(admin, answers, onboarding.assets.logoUrl ?? null).catch((error: unknown) => {
    // Validation and database errors are for the log, not the buyer.
    console.error('[onboarding] store could not be created', error instanceof Error ? error.message : error)
    throw buyerFacingError(GENERIC_FAILURE)
  })

  let ownerUserId: string
  try {
    const owner = await createTenantOwnerWithClient(admin, {
      tenantId: store.tenantId,
      email: lead.email,
      password: ownerPassword,
      displayName: lead.name,
    })
    ownerUserId = owner.userId
  } catch (error) {
    await removeTenant(admin, store.tenantId)
    throw buyerFacingError(describeOwnerError(error instanceof Error ? error.message : String(error)))
  }

  try {
    await attachOnboardingTenant(admin, onboarding.id, store.tenantId)
  } catch (error) {
    // Undo the login too, or the retry would hit "email already registered".
    const { error: userError } = await admin.auth.admin.deleteUser(ownerUserId)
    if (userError) console.error('[onboarding] owner login could not be removed', { error: userError.message })
    await removeTenant(admin, store.tenantId)
    throw error
  }
  return store
}

/**
 * Claim the submit, create the store and its owner, and link the lead. Any
 * failure releases the claim (and removes a half-made store), so the buyer can
 * simply press the button again.
 */
export async function provisionStore(
  admin: AdminClient,
  onboarding: StoreOnboarding,
  answers: OnboardingAnswers,
  ownerPassword: string,
): Promise<ProvisionedStore> {
  if (!(await claimOnboardingSubmit(admin, onboarding.id, answers))) {
    throw buyerFacingError('This store is already being set up.')
  }

  let store: ProvisionedStore
  try {
    store = await createStoreWithOwner(admin, onboarding, answers, ownerPassword)
  } catch (error) {
    // The reason is stored on the row and shown in the wizard: buyer text only.
    if (!isBuyerFacingError(error)) console.error('[onboarding] store set-up failed', error instanceof Error ? error.message : error)
    const message = isBuyerFacingError(error) ? error.message : GENERIC_FAILURE
    await releaseOnboardingSubmit(admin, onboarding.id, message)
    throw buyerFacingError(message)
  }

  await linkLeadToStore(admin, onboarding.checkoutLeadId, store.tenantId)
  return store
}

/**
 * Point the lead at its store. The status moves only from `initiated`: staff
 * may already have confirmed the payment (`paid`) or closed the lead, and
 * reverting `paid` would leave "Launch my store" awaiting a payment that was
 * confirmed once and never again.
 */
async function linkLeadToStore(admin: AdminClient, leadId: string, tenantId: string): Promise<void> {
  const updatedAt = new Date().toISOString()
  const { error: linkError } = await admin
    .from('checkout_leads')
    .update({ tenant_id: tenantId, updated_at: updatedAt } as never)
    .eq('id', leadId)
  if (linkError) console.error('[onboarding] lead could not be linked to its store', { leadId, error: linkError.message })

  const { error: statusError } = await admin
    .from('checkout_leads')
    .update({ status: 'setup_in_progress', updated_at: updatedAt } as never)
    .eq('id', leadId)
    .eq('status', 'initiated')
  if (statusError) console.error('[onboarding] lead status could not be advanced', { leadId, error: statusError.message })
}
