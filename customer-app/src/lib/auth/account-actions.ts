import { AppApiError } from '@/lib/api/app-client'
import type { AppOtpVerifyResult } from '@/lib/contract'
import { queryClient, queryKeys } from '@/lib/data/hooks'
import { appClientFromEnv } from '@/lib/data/live-source'
import { useCart } from '@/lib/stores/cart'
import { useSession, type MemberProfile } from '@/lib/stores/session'
import { createLiveAuth, createPrototypeAuth, type AuthSource } from './auth-source'
import { setSessionRefusedHandler, withSession } from './session-guard'
import { clearSessionToken, loadSessionToken, saveSessionToken } from './session-storage'

/**
 * Everything that changes who is signed in. A change of person drops every
 * per-customer cache (rewards, member QR, orders) and the bag, so the next
 * person on this phone never sees the last one's data.
 */
const client = appClientFromEnv()
export const auth: AuthSource = client ? createLiveAuth(client) : createPrototypeAuth()

function forgetCustomerData() {
  queryClient.removeQueries({ queryKey: queryKeys.loyalty })
  queryClient.removeQueries({ queryKey: queryKeys.orders })
  // Addresses searched and quoted, and vouchers previewed, were this person's too.
  queryClient.removeQueries({ queryKey: ['deliveryQuote'] })
  queryClient.removeQueries({ queryKey: ['places'] })
  queryClient.removeQueries({ queryKey: ['voucherPreview'] })
  useCart.getState().clear()
}

async function becomeGuest() {
  forgetCustomerData()
  useSession.getState().setGuest()
  await clearSessionToken()
}

/** At launch: a saved session that the store still accepts signs the customer back in. */
export async function restoreSession(): Promise<void> {
  const token = await loadSessionToken()
  if (!token) return useSession.getState().setGuest()
  try {
    useSession.getState().setMember(token, await auth.getProfile(token))
  } catch (error) {
    // Only a refused session signs out; offline keeps the saved session for next launch.
    if (error instanceof AppApiError && error.code === 'unauthorized') await clearSessionToken()
    useSession.getState().setGuest()
  }
}

/** After a verified code. Returns whether to ask for a name. */
export async function completeSignIn(result: AppOtpVerifyResult): Promise<boolean> {
  forgetCustomerData()
  useSession.getState().setMember(result.token, result.profile)
  await saveSessionToken(result.token)
  return result.isNewCustomer || result.profile.name === null
}

/** A refused session (expired, revoked elsewhere) ends here — from any per-customer call: signed out, quietly. */
setSessionRefusedHandler(becomeGuest)
const asMember = withSession

export async function saveName(name: string | null): Promise<MemberProfile> {
  const profile = await asMember((token) => auth.updateName(token, name))
  useSession.getState().setProfile(profile)
  return profile
}

/** Signs this phone out; the server forgets the session even if this call fails later. */
export async function signOut(): Promise<void> {
  const { token } = useSession.getState()
  await becomeGuest()
  if (token) await auth.signOut(token).catch(() => undefined)
}

/** Apple 5.1.1(v): removes the app account. Throws (and stays signed in) if the store didn't confirm. */
export async function deleteAccount(): Promise<void> {
  await asMember((token) => auth.deleteAccount(token))
  await becomeGuest()
}
